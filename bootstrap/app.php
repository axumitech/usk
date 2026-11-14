<?php

use App\Http\Middleware\EnsureApplicationKey;
use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\ObserveHttp;
use App\Http\Middleware\SeoResponse;
use App\Http\Middleware\StartNavigationSession;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;
use Illuminate\Session\Middleware\AuthenticateSession;
use Illuminate\Session\Middleware\StartSession;
use Spatie\Permission\Middleware\PermissionMiddleware;
use Spatie\Permission\Middleware\RoleMiddleware;
use Spatie\Permission\Middleware\RoleOrPermissionMiddleware;
use Symfony\Component\HttpFoundation\Response;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->redirectGuestsTo(fn () => route('login.show'));
        $middleware->redirectUsersTo(fn () => route('dashboard.index'));
        $middleware->prepend([ObserveHttp::class, EnsureApplicationKey::class]);
        $middleware->encryptCookies(except: ['appearance', 'sidebar_state', 'usk_audience']);
        $middleware->alias([
            'role' => RoleMiddleware::class,
            'permission' => PermissionMiddleware::class,
            'role_or_permission' => RoleOrPermissionMiddleware::class,
        ]);

        $middleware->web(replace: [StartSession::class => StartNavigationSession::class], append: [
            AuthenticateSession::class,
            SeoResponse::class,
            HandleAppearance::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::using(24),
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->dontFlash('email_current_password');
        $exceptions->respond(function (Response $response, Throwable $exception, Request $request) {
            if ($response->getStatusCode() >= 400) {
                $response->headers->set('X-Robots-Tag', 'noindex, nofollow, noarchive');
            }

            if ($request->is('app', 'app/*')) {
                $response->headers->set('Cache-Control', 'private, no-store, max-age=0');
            }

            return $response;
        });
    })->create();
