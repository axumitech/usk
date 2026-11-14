<?php

use App\Http\Controllers\LegacyApplicationController;
use Illuminate\Support\Facades\Route;

Route::any('/dashboard/{path?}', LegacyApplicationController::class)->where('path', '.*');
Route::any('/{endpoint}', LegacyApplicationController::class)
    ->where('endpoint', 'login|logout|register|forgot-password|reset-password');
Route::any('/reset-password/{token}', LegacyApplicationController::class);
Route::any('/email/{endpoint}', LegacyApplicationController::class)
    ->where('endpoint', 'verify|verification-notification');
Route::any('/invitation-enseignant/{professor}/{token}', LegacyApplicationController::class);
Route::get('/auth/{provider}/redirect', LegacyApplicationController::class);
