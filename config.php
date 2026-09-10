<?php

declare(strict_types=1);

const DB_HOST = '127.0.0.1';
const DB_NAME = 'project_josh';
const DB_USER = 'root';
const DB_PASSWORD = '';
const ADMIN_EMAIL = 'admin@projectjosh.gov';
const ADMIN_PASSWORD = 'northstar';

function db(): PDO
{
    static $pdo;
    if (!$pdo) {
        $pdo = new PDO(
            'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4',
            DB_USER,
            DB_PASSWORD,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
        );
    }
    return $pdo;
}

function jsonResponse(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data);
    exit;
}

function requestBody(): array
{
    $body = json_decode(file_get_contents('php://input'), true);
    return is_array($body) ? $body : [];
}

function requireFields(array $body, array $fields): void
{
    foreach ($fields as $field) {
        if (!isset($body[$field]) || trim((string) $body[$field]) === '') {
            jsonResponse(['error' => "Missing field: {$field}"], 422);
        }
    }
}
