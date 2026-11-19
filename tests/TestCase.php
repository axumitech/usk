<?php

namespace Tests;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    public function createApplication()
    {
        $app = parent::createApplication();
        $driver = $app['config']->get('database.default');
        $database = $app['config']->get('database.connections.'.$driver.'.database');
        if ($driver === 'sqlite' && $database === ':memory:' || $driver === 'pgsql' && $database === 'umk_test') {
            return $app;
        }
        $settings = $app['config']->get('database.connections.mysql');
        $directory = getenv('USK_QA_MYSQL_DATADIR');
        if ($driver !== 'mysql' || $database !== 'usk_qa_e2e' || $settings['host'] !== '127.0.0.1'
            || (int) $settings['port'] === 3306 || ! $directory || ! is_dir($directory)) {
            throw new \RuntimeException('Select an isolated QA database before running the test suite.');
        }
        $identity = $app['db']->connection()->selectOne('SELECT DATABASE() AS db_name, @@datadir AS dir, @@port AS port, @@bind_address AS bind_address');
        if ($identity->db_name !== $database || realpath($directory) !== realpath($identity->dir)
            || $identity->bind_address !== '127.0.0.1' || (int) $identity->port !== (int) $settings['port']) {
            throw new \RuntimeException('MySQL does not match the disposable local QA instance.');
        }

        return $app;
    }

    // actingAs simulates a fresh authentication, including the session fingerprint.
    public function actingAs(Authenticatable $user, $guard = null)
    {
        parent::actingAs($user, $guard);
        $this->app['session']->put('password_hash_'.($guard ?? config('auth.defaults.guard')), $user->getAuthPassword());

        return $this;
    }
}
