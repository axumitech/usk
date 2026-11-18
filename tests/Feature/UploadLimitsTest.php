<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\DocumentUploadLimit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

final class UploadLimitsTest extends TestCase
{
    use RefreshDatabase;

    public function test_admission_advertises_and_applies_distinct_pdf_and_image_limits(): void
    {
        Storage::fake('temp');
        $this->actingAs(User::factory()->create());
        $limits = DocumentUploadLimit::forForms();
        $this->get('/app/dashboard/enrollments/create')->assertInertia(fn (Assert $page) => $page
            ->where('uploadLimits.document_kb', $limits['document_kb'])->where('uploadLimits.image_kb', $limits['image_kb']));

        $upload = '/app/dashboard/enrollments/documents/upload';
        foreach ([
            UploadedFile::fake()->create('diplome.pdf', $limits['document_kb'], 'application/pdf'),
            UploadedFile::fake()->image('photo.png')->size($limits['image_kb']),
        ] as $file) {
            $path = $this->postJson($upload, ['key' => 'proof', 'file' => $file])->assertOk()->json('temp.path');
            Storage::disk('temp')->assertExists($path);
        }

        foreach ([
            UploadedFile::fake()->create('diplome.pdf', $limits['document_kb'] + 1, 'application/pdf'),
            UploadedFile::fake()->image('photo.png')->size($limits['image_kb'] + 1),
            UploadedFile::fake()->create('renomme.pdf', 1, 'text/html'),
            UploadedFile::fake()->create('sans-extension', 1, 'application/pdf'),
        ] as $file) {
            $this->postJson($upload, ['key' => 'proof', 'file' => $file])->assertUnprocessable()->assertJsonValidationErrors('file');
        }
        $this->assertCount(2, Storage::disk('temp')->allFiles());
    }
}
