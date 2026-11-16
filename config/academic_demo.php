<?php

return [
    // Empty: use the current open year, otherwise October–September around today (Kinshasa).
    'year' => env('DEMO_ACADEMIC_YEAR'),
    // Empty: the new demo administrator gets a random password, displayed only in the CLI.
    'password' => env('DEMO_ACCOUNTS_PASSWORD'),
];
