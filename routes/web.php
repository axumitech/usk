<?php

use App\Http\Controllers\PwaEntryController;
use App\Http\Controllers\PwaWorkerController;
use App\Http\Controllers\SwitchPageController;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\SeoResponse;
use App\Http\Middleware\StartNavigationSession;
use App\Modules\Documents\Infrastructure\Http\DocumentVerificationController;
use App\Modules\Identity\Infrastructure\Http\Controllers\EmailVerificationController;
use App\Modules\Identity\Infrastructure\Http\Controllers\SocialAuthController;
use App\Modules\Seo\Infrastructure\Http\Controllers\AudienceController;
use App\Modules\Seo\Infrastructure\Http\Controllers\PublicSeoController;
use App\Modules\Student\Infrastructure\Http\Controllers\FinanceController;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Session\Middleware\AuthenticateSession;
use Illuminate\Support\Facades\Route;
use Illuminate\View\Middleware\ShareErrorsFromSession;

Route::get('/sitemap.xml', [PublicSeoController::class, 'sitemap'])->name('seo.sitemap');
Route::get('/robots.txt', [PublicSeoController::class, 'robots'])->name('seo.robots');
Route::get('/plan-du-site', [PublicSeoController::class, 'plan'])->name('site-plan');
foreach (config('seo.legal') as $key => $definition) {
    Route::get($definition['path'], [PublicSeoController::class, 'legal'])->defaults('key', $key)->name('legal.'.$key);
}
Route::post('/analytics/events', AudienceController::class)->middleware('throttle:60,1')->name('seo.events');
// Routes statiques
Route::get('/', [SwitchPageController::class, 'home'])->name('home');
Route::get('/admission', [SwitchPageController::class, 'admission'])->name('admission');
Route::get('/courses', [SwitchPageController::class, 'courses'])->name('courses');
Route::get('/faculties/{id}', [SwitchPageController::class, 'facultyShow'])->whereNumber('id')->name('faculties.show');
Route::get('/about', [SwitchPageController::class, 'about'])->name('about');
Route::get('/course/{id}', [SwitchPageController::class, 'courseShow'])->whereNumber('id')->name('courseShow');
Route::get('/contact', [SwitchPageController::class, 'contact'])->name('contact');
Route::get('blog', [SwitchPageController::class, 'blog'])->name('blog');
Route::get('blog/{id}', [SwitchPageController::class, 'blogDetails'])->whereNumber('id')->name('blog.show');
Route::redirect('/politique', '/politique-de-confidentialite', 301)->name('politique');
Route::redirect('/condition', '/conditions-generales-utilisation', 301)->name('condition');
Route::get('tuitions', [SwitchPageController::class, 'tuitions'])->name('tuitions');

// OAuth callbacks and previously issued signed verification links retain their URL.
Route::get('/auth/{provider}/callback', [SocialAuthController::class, 'callback']);
Route::get('/email/verify/{id}/{hash}', [EmailVerificationController::class, 'verify'])
    ->middleware(['auth', 'signed']);

Route::prefix('app')->group(function () {
    Route::get('/sw.js', PwaWorkerController::class)
        ->withoutMiddleware([
            StartNavigationSession::class,
            ShareErrorsFromSession::class,
            ValidateCsrfToken::class,
            AuthenticateSession::class,
            HandleInertiaRequests::class,
            SeoResponse::class,
        ])
        ->name('pwa.worker');
    Route::get('/', PwaEntryController::class)->name('pwa.entry');

    require __DIR__.'/application.php';
});

require __DIR__.'/pwa-legacy.php';

Route::get('/finance/receipts/{payment:uuid}/verify', [FinanceController::class, 'verify'])->middleware(['signed', 'throttle:60,1'])->name('finance.receipts.verify');

Route::get('/verifier/document/{reference}', \App\Modules\Documents\Infrastructure\Http\DocumentVerificationController::class)
    ->middleware('throttle:30,1')->name('official-documents.verify');
