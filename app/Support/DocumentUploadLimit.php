<?php

namespace App\Support;

use Closure;
use Illuminate\Http\UploadedFile;

final class DocumentUploadLimit
{
    public static function kilobytes(int $maximum = 10240): int
    {
        $limits = [$maximum];
        foreach (['upload_max_filesize', 'post_max_size'] as $setting) {
            $bytes = ini_parse_quantity(ini_get($setting));
            if ($bytes > 0) {
                $limits[] = max(1, (int) floor(($bytes - ($setting === 'post_max_size' ? 524288 : 0)) / 1024));
            }
        }

        return min($limits);
    }

    public static function images(): int
    {
        return self::kilobytes(5120);
    }

    public static function forForms(): array
    {
        return ['document_kb' => self::kilobytes(), 'image_kb' => self::images()];
    }

    public static function proofRules(bool $required = true): array
    {
        return [
            'bail', $required ? 'required' : 'nullable', 'file',
            'mimes:pdf,jpg,jpeg,png,webp', 'extensions:pdf,jpg,jpeg,png,webp',
            'max:'.self::kilobytes(), self::limitImage(),
        ];
    }

    public static function limitImage(): Closure
    {
        return function (string $attribute, UploadedFile $file, Closure $fail): void {
            if (str_starts_with($file->getMimeType() ?? '', 'image/') && $file->getSize() > self::images() * 1024) {
                $fail(self::sizeMessage(self::images(), 'L’image'));
            }
        };
    }

    public static function sizeMessage(int $kilobytes, string $subject = 'Le fichier'): string
    {
        // Round down so the advertised limit never exceeds what the server accepts.
        $size = $kilobytes < 1024 ? $kilobytes.' Ko' : rtrim(rtrim(number_format(floor($kilobytes * 100 / 1024) / 100, 2, ',', ''), '0'), ',').' Mo';

        return $subject.' dépasse la taille maximale de '.$size.'.';
    }

    public static function proofMessages(string $field = 'file'): array
    {
        return [
            $field.'.max' => self::sizeMessage(self::kilobytes()),
            $field.'.mimes' => 'Choisissez un fichier PDF, JPG, PNG ou WebP.',
            $field.'.extensions' => 'Choisissez un fichier PDF, JPG, PNG ou WebP.',
            $field.'.uploaded' => 'Le fichier n’a pas pu être reçu. Vérifiez son format et sa taille.',
        ];
    }
}
