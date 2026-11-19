<?php

declare(strict_types=1);

use App\Http\Middleware\HandleInertiaRequests;
use App\Models\Student\AcademicAudit;
use App\Models\Student\StudentPayment;
use App\Models\Student\StudentPaymentProof;
use App\Models\User;
use App\Modules\Student\Application\Services\Money;
use App\Modules\Student\Application\Services\StudentPaymentProofs;
use Database\Seeders\RecetteV2\RecipeDatabase;
use Illuminate\Contracts\Console\Kernel as Console;
use Illuminate\Contracts\Http\Kernel as Http;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

$server = realpath(getenv('USK_QA_SERVER_REPO') ?: dirname(__DIR__, 3));
require $server.'/docs/recette-manuelle-v2/scripts/bootstrap.php';

function checkProofs(bool $condition, string $message): void
{
    if (! $condition) {
        throw new RuntimeException($message);
    }
}

function proofImage(string $reference, string $amount, string $currency): string
{
    $image = imagecreatetruecolor(640, 140);
    imagefill($image, 0, 0, imagecolorallocate($image, 255, 255, 255));
    $ink = imagecolorallocate($image, 20, 45, 56);
    imagestring($image, 5, 22, 16, 'SPECIMEN USK - CHARGE SYNTHETIQUE', $ink);
    imagestring($image, 4, 22, 54, 'Virement fictif '.$reference, $ink);
    imagestring($image, 4, 22, 90, 'Montant '.$amount.' '.$currency, $ink);
    ob_start();
    imagepng($image);

    return ob_get_clean();
}

$root = realpath((string) getenv('USK_RECETTE_V2_ROOT'));
checkProofs(PHP_SAPI === 'cli' && in_array(getenv('APP_ENV') ?: 'local', ['local', 'testing'], true)
    && $root !== false && basename($root) === 'usk_qa_e2e-volume' && ! str_starts_with($root, '\\\\')
    && is_file($root.'/volume-qa') && ! is_link($root.'/volume-qa')
    && trim(file_get_contents($root.'/volume-qa')) === 'Charge synthétique locale', 'Le profil de charge dédié est requis.');
$app = recetteApplication();
$app->make(Console::class)->bootstrap();
RecipeDatabase::assertConnection();
checkProofs(DB::table('student_profiles')->count() === 5000 && ! User::where('email', 'not like', '%@usk.test')->exists()
    && realpath(config('filesystems.disks.local.root')) === realpath($root.'/storage/app/private'), 'Population ou stockage hors profil de charge.');
$desk = User::where('email', 'admin@usk.test')->sole();
$proofs = app(StudentPaymentProofs::class);
$payments = StudentPayment::with('enrollment.profile.user')->where('reference', 'like', 'QA-VOL-%')
    ->where('status', 'confirmed')->orderBy('reference')->limit(300)->get();
checkProofs($payments->count() === 300, 'Le profil doit contenir 300 paiements de charge déjà confirmés.');
$before = StudentPayment::count();
$new = $accepted = 0;
$references = $hashes = $ids = [];
foreach ($payments as $i => $payment) {
    $entry = $payment->enrollment;
    $payer = $entry->profile->user;
    checkProofs($entry->matricule === $payment->reference && $payer->email === strtolower($entry->matricule).'@usk.test'
        && $payment->method === 'bank_transfer', 'Référence de paiement ou étudiant inattendu.');
    $amount = Money::decimal((int) $payment->amount_cents);
    $bytes = proofImage($payment->reference, $amount, $payment->currency);
    $proof = StudentPaymentProof::where('academic_enrollment_id', $entry->id)->where('reference', $payment->reference)->first();
    if (! $proof) {
        $proof = $proofs->submit($entry, $payer, ['kind' => $payment->kind, 'amount' => $amount,
            'method' => $payment->method, 'reference' => $payment->reference],
            UploadedFile::fake()->createWithContent($payment->reference.'.png', $bytes));
        $new++;
    }
    $reviewed = ($i + 1) % 5 === 0;
    if ($reviewed && $proof->status === 'pending') {
        $proofs->review($proof, $desk, 'approve', 'Charge synthétique USK. Référence et montant rapprochés du virement fictif existant.');
        $proof->refresh();
    }
    checkProofs($proof->status === ($reviewed ? 'accepted' : 'pending') && (int) $proof->amount_cents === (int) $payment->amount_cents
        && $proof->currency === $payment->currency && $proof->method === $payment->method
        && ($reviewed ? (int) $proof->student_payment_id === (int) $payment->id : $proof->student_payment_id === null), 'État du rapprochement incohérent.');
    $digest = hash('sha256', $bytes);
    checkProofs(hash_equals($digest, Storage::disk('local')->checksum($proof->file_path, ['checksum_algo' => 'sha256'])), 'Empreinte de la pièce incohérente.');
    $events = AcademicAudit::where('entity_type', $proof->getTable())->where('entity_id', $proof->id)->get(['action', 'actor_id']);
    checkProofs($events->count() === ($reviewed ? 2 : 1)
        && $events->where('action', 'payment_proof_submitted')->where('actor_id', $payer->id)->count() === 1
        && (! $reviewed || $events->where('action', 'payment_proof_accepted')->where('actor_id', $desk->id)->count() === 1), 'Audit du dépôt ou de la décision incohérent.');
    $accepted += (int) $reviewed;
    $ids[] = $proof->id;
    $hashes[] = $digest;
    if (! $reviewed) {
        $references[] = $payment->reference;
    }
}
checkProofs($before === StudentPayment::count() && count(array_unique($hashes)) === 300 && count(array_unique($ids)) === 300, 'Nombre de paiements, de pièces ou de dossiers incohérent.');
checkProofs(DB::select('PRAGMA foreign_key_check') === [] && DB::scalar('PRAGMA quick_check') === 'ok', 'Intégrité SQLite invalide.');
$http = $app->make(Http::class);
$queryCount = 0;
DB::listen(static function () use (&$queryCount) { $queryCount++; });
$report = ['date_utc' => gmdate('Y-m-d\TH:i:s\Z'), 'population' => 5000, 'profil' => 'usk_qa_e2e-volume',
    'mode' => 'SQLite local, service métier de dépôt et rapprochement, noyau HTTP Laravel, requêtes séquentielles',
    'paiements_avant' => $before, 'paiements_apres' => StudentPayment::count(), 'justificatifs_charge' => count($ids),
    'nouveaux_ce_passage' => $new, 'justificatifs_hors_lot' => StudentPaymentProof::whereNotIn('id', $ids)->count(),
    'en_attente_de_rapprochement' => count($references), 'rapproches_aux_paiements_existants' => $accepted,
    'fichiers_png_distincts_verifies' => count($hashes), 'audit_depots_verifies' => count($ids), 'audit_decisions_verifiees' => $accepted,
    'empreinte_sha256_liste_ordonnee_des_fichiers' => hash('sha256', implode("\n", $hashes)), 'integrite_sqlite' => 'ok', 'mesures' => []];
$base = '/app/dashboard/admin/finance/payment-proofs';
$firstPage = [];
foreach ([['QA-VOL', 1, 20, 240], ['QA-VOL', 2, 20, 240], [$references[0], 1, 1, 1]] as [$term, $number, $size, $total]) {
    $times = $queries = [];
    for ($run = 0; $run <= 10; $run++) {
        $app['auth']->guard()->setUser($desk);
        $request = Request::create($base, 'GET', ['q' => $term, 'page' => $number], server: ['HTTP_X_INERTIA' => 'true', 'HTTP_ACCEPT' => 'text/html']);
        $request->headers->set('X-Inertia-Version', $app->make(HandleInertiaRequests::class)->version($request) ?? '');
        $queryCount = 0;
        $start = hrtime(true);
        $response = $http->handle($request);
        $http->terminate($request, $response);
        $time = (hrtime(true) - $start) / 1e6;
        $count = $queryCount;
        checkProofs($response->getStatusCode() === 200, 'Le registre des justificatifs a retourné HTTP '.$response->getStatusCode().'.');
        $page = json_decode($response->getContent(), true, 512, JSON_THROW_ON_ERROR);
        $rows = $page['props']['rows'];
        $displayed = array_column($rows['data'], 'reference');
        checkProofs($rows['total'] === $total && $rows['current_page'] === $number && count($displayed) === $size
            && ! array_diff($displayed, $references) && ($total !== 1 || $displayed === [$term]), 'Résultat de pagination ou de recherche incorrect.');
        if ($number === 2) {
            checkProofs(! array_intersect($displayed, $firstPage), 'Les deux pages contiennent les mêmes pièces.');
        } elseif ($size === 20) {
            $firstPage = $displayed;
        }
        if ($run > 0) {
            $times[] = $time;
            $queries[] = $count;
        }
    }
    sort($times, SORT_NUMERIC);
    $report['mesures'][] = ['route' => $base, 'recherche' => $term, 'page' => $number, 'total' => $total,
        'lignes_affichees' => $size, 'n' => count($times), 'echauffements_exclus' => 1, 'p50_ms' => round(($times[4] + $times[5]) / 2, 2),
        'p95_ms' => round($times[9], 2), 'requetes_sql_min' => min($queries), 'requetes_sql_max' => max($queries)];
}
$output = dirname(__DIR__).'/preuves/volume-justificatifs.json';
if ($new === 0 && is_file($output)) {
    $first = json_decode(file_get_contents($output), true, 512, JSON_THROW_ON_ERROR);
    checkProofs($first['empreinte_sha256_liste_ordonnee_des_fichiers'] === $report['empreinte_sha256_liste_ordonnee_des_fichiers'],
        'Les pièces du second passage diffèrent du premier inventaire.');
    $report['premier_passage'] = basename($output);
    $output = dirname(__DIR__).'/preuves/volume-justificatifs-reprise.json';
}
checkProofs(file_put_contents($output, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR).PHP_EOL, LOCK_EX) !== false, 'Écriture de la preuve impossible.');
echo $output.PHP_EOL;
