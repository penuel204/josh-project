<?php

declare(strict_types=1);
require __DIR__ . '/config.php';

$action = $_GET['action'] ?? '';
$body = requestBody();

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'accounts') {
        $accounts = db()->query("SELECT id, full_name AS name, registration_no AS regNo, government_unit AS option, email, role, status, last_login_at AS lastLoginAt, created_at AS createdAt FROM accounts WHERE status <> 'deleted' ORDER BY created_at DESC")->fetchAll();
        jsonResponse(['accounts' => $accounts]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'admin-reports') {
        $reports = db()->query("SELECT r.id, r.title, r.content, r.status, r.feedback, r.rating, r.updated_at AS updatedAt, a.full_name AS accountName, a.registration_no AS regNo FROM reports r JOIN accounts a ON a.id = r.account_id ORDER BY r.updated_at DESC")->fetchAll();
        jsonResponse(['reports' => $reports]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'account-status') {
        requireFields($body, ['accountId', 'status']);
        $stmt = db()->prepare("UPDATE accounts SET status = ? WHERE id = ? AND role <> 'admin'");
        $stmt->execute([$body['status'] === 'inactive' ? 'inactive' : 'active', (int) $body['accountId']]);
        jsonResponse(['message' => 'Account status updated.']);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'account-delete') {
        requireFields($body, ['accountId']);
        $stmt = db()->prepare("UPDATE accounts SET status = 'deleted' WHERE id = ? AND role <> 'admin'");
        $stmt->execute([(int) $body['accountId']]);
        jsonResponse(['message' => 'Account deleted.']);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'account-role') {
        requireFields($body, ['accountId', 'role']);
        $role = $body['role'] === 'admin' ? 'admin' : 'user';
        $stmt = db()->prepare('UPDATE accounts SET role = ? WHERE id = ?');
        $stmt->execute([$role, (int) $body['accountId']]);
        jsonResponse(['message' => 'Account role updated.']);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'admin-create') {
        requireFields($body, ['name', 'regNo', 'email', 'password']);
        $stmt = db()->prepare("INSERT INTO accounts (full_name, registration_no, government_unit, email, password_hash, role) VALUES (?, ?, ?, ?, ?, 'admin')");
        $stmt->execute([trim($body['name']), trim($body['regNo']), trim($body['option'] ?? 'Public Administration'), strtolower(trim($body['email'])), password_hash($body['password'], PASSWORD_DEFAULT)]);
        jsonResponse(['message' => 'Administrator account created.'], 201);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'units') {
        jsonResponse(['units' => db()->query('SELECT id, name FROM government_units ORDER BY name')->fetchAll()]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'unit') {
        requireFields($body, ['name']);
        $stmt = db()->prepare('INSERT INTO government_units (name) VALUES (?)');
        $stmt->execute([trim($body['name'])]);
        jsonResponse(['message' => 'Government unit created.'], 201);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'unit-delete') {
        requireFields($body, ['unitId']);
        db()->prepare('DELETE FROM government_units WHERE id = ?')->execute([(int) $body['unitId']]);
        jsonResponse(['message' => 'Government unit deleted.']);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'review') {
        requireFields($body, ['reportId', 'status']);
        $reportId = (int) $body['reportId'];
        $feedback = trim((string) ($body['feedback'] ?? ''));
        $rating = $body['rating'] ? max(1, min(5, (int) $body['rating'])) : null;
        db()->beginTransaction();
        db()->prepare('UPDATE reports SET status = ?, feedback = ?, rating = ? WHERE id = ?')->execute([trim($body['status']), $feedback, $rating, $reportId]);
        $owner = db()->prepare('SELECT account_id, title FROM reports WHERE id = ?');
        $owner->execute([$reportId]);
        $report = $owner->fetch();
        if ($report) db()->prepare("INSERT INTO notifications (account_id, title, message, type) VALUES (?, 'Report review updated', ?, 'review')")->execute([(int) $report['account_id'], $feedback ?: 'Your report status and rating were updated.']);
        db()->commit();
        jsonResponse(['message' => 'Report review saved.']);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'task') {
        requireFields($body, ['accountId', 'title']);
        db()->beginTransaction();
        db()->prepare('INSERT INTO tasks (account_id, title, details, due_at) VALUES (?, ?, ?, ?)')->execute([(int) $body['accountId'], trim($body['title']), trim((string) ($body['details'] ?? '')), $body['dueAt'] ?: null]);
        db()->prepare('INSERT INTO notifications (account_id, title, message, type) VALUES (?, ?, ?, \'task\')')->execute([(int) $body['accountId'], 'New task assigned', trim($body['title'])]);
        db()->commit();
        jsonResponse(['message' => 'Task assigned.'], 201);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'announcement') {
        requireFields($body, ['title', 'message']);
        db()->beginTransaction();
        db()->prepare('INSERT INTO system_announcements (title, message) VALUES (?, ?)')->execute([trim($body['title']), trim($body['message'])]);
        db()->prepare("INSERT INTO notifications (account_id, title, message, type) SELECT id, ?, ?, 'announcement' FROM accounts WHERE status = 'active'")->execute([trim($body['title']), trim($body['message'])]);
        db()->commit();
        jsonResponse(['message' => 'Announcement published.'], 201);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'user-notifications') {
        $stmt = db()->prepare('SELECT id, title, message, type, read_at AS readAt, created_at AS createdAt FROM notifications WHERE account_id = ? ORDER BY created_at DESC LIMIT 30');
        $stmt->execute([(int) ($_GET['accountId'] ?? 0)]);
        jsonResponse(['notifications' => $stmt->fetchAll()]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'user-tasks') {
        $stmt = db()->prepare('SELECT id, title, details, due_at AS dueAt, status, created_at AS createdAt FROM tasks WHERE account_id = ? ORDER BY created_at DESC');
        $stmt->execute([(int) ($_GET['accountId'] ?? 0)]);
        jsonResponse(['tasks' => $stmt->fetchAll()]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'task-status') {
        requireFields($body, ['taskId', 'status']);
        $status = in_array($body['status'], ['assigned', 'in_progress', 'completed'], true) ? $body['status'] : 'assigned';
        db()->prepare('UPDATE tasks SET status = ? WHERE id = ?')->execute([$status, (int) $body['taskId']]);
        jsonResponse(['message' => 'Task status updated.']);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'activity') {
        jsonResponse(['activity' => db()->query("SELECT a.full_name AS name, a.registration_no AS regNo, MAX(l.created_at) AS lastUsedAt, COUNT(l.id) AS sessionCount FROM activity_log l JOIN accounts a ON a.id = l.account_id GROUP BY a.id ORDER BY lastUsedAt DESC")->fetchAll()]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'overview') {
        $accountId = (int) ($_GET['accountId'] ?? 0);
        $scope = $accountId > 0 ? 'WHERE account_id = ?' : '';
        $params = $accountId > 0 ? [$accountId] : [];
        $stmt = db()->prepare("SELECT COUNT(*) AS totalReports, SUM(status IN ('Under review', 'Submitted')) AS awaitingReview, SUM(status IN ('Approved', 'Published')) AS publishedReports FROM reports {$scope}");
        $stmt->execute($params);
        $metrics = $stmt->fetch() ?: [];
        $stmt = db()->prepare("SELECT id, title, status, updated_at AS updatedAt, account_id AS accountId FROM reports {$scope} ORDER BY updated_at DESC LIMIT 5");
        $stmt->execute($params);
        $recent = $stmt->fetchAll();
        $activityScope = $accountId > 0 ? 'WHERE account_id = ? AND updated_at >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)' : 'WHERE updated_at >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)';
        $stmt = db()->prepare("SELECT MONTH(updated_at) AS monthNumber, COUNT(*) AS reportCount FROM reports {$activityScope} GROUP BY MONTH(updated_at) ORDER BY monthNumber");
        $stmt->execute($params);
        $activity = $stmt->fetchAll();
        $officials = (int) db()->query("SELECT COUNT(*) FROM accounts WHERE role = 'user'")->fetchColumn();
        jsonResponse(['metrics' => ['totalReports' => (int) ($metrics['totalReports'] ?? 0), 'awaitingReview' => (int) ($metrics['awaitingReview'] ?? 0), 'publishedReports' => (int) ($metrics['publishedReports'] ?? 0), 'activeOfficials' => $officials], 'recentReports' => $recent, 'activity' => $activity, 'deadlines' => []]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'profile') {
        requireFields($body, ['accountId', 'name', 'regNo', 'option']);
        $accountId = (int) $body['accountId'];
        $governmentUnit = trim($body['option']);
        db()->beginTransaction();
        $stmt = db()->prepare('UPDATE accounts SET full_name = ?, registration_no = ?, government_unit = ?, photo_data = COALESCE(?, photo_data) WHERE id = ?');
        $stmt->execute([trim($body['name']), trim($body['regNo']), $governmentUnit, $body['photoData'] ?? null, $accountId]);
        $settings = db()->prepare('INSERT INTO account_settings (account_id, workspace_name, default_unit) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE workspace_name = VALUES(workspace_name), default_unit = VALUES(default_unit)');
        $settings->execute([$accountId, 'Office of ' . $governmentUnit, $governmentUnit]);
        $stmt = db()->prepare('SELECT id, full_name AS name, registration_no AS regNo, government_unit AS option, photo_data AS photoData, role FROM accounts WHERE id = ?');
        $stmt->execute([$accountId]);
        db()->commit();
        jsonResponse(['account' => $stmt->fetch()]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'settings') {
        $stmt = db()->prepare('SELECT COALESCE(s.workspace_name, CONCAT("Office of ", a.government_unit)) AS workspaceName, COALESCE(s.timezone, "UTC") AS timezone, a.government_unit AS defaultUnit, COALESCE(s.email_notifications, 1) AS emailNotifications FROM accounts a LEFT JOIN account_settings s ON s.account_id = a.id WHERE a.id = ?');
        $stmt->execute([(int) ($_GET['accountId'] ?? 0)]);
        jsonResponse(['settings' => $stmt->fetch() ?: ['workspaceName' => 'Office of Public Administration', 'timezone' => 'UTC', 'defaultUnit' => 'Public Administration', 'emailNotifications' => 1]]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'settings') {
        requireFields($body, ['accountId', 'timezone']);
        $account = db()->prepare('SELECT government_unit FROM accounts WHERE id = ?');
        $account->execute([(int) $body['accountId']]);
        $governmentUnit = (string) $account->fetchColumn();
        $stmt = db()->prepare('INSERT INTO account_settings (account_id, workspace_name, timezone, default_unit, email_notifications) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE workspace_name = VALUES(workspace_name), timezone = VALUES(timezone), default_unit = VALUES(default_unit), email_notifications = VALUES(email_notifications)');
        $stmt->execute([(int) $body['accountId'], 'Office of ' . $governmentUnit, trim($body['timezone']), $governmentUnit, !empty($body['emailNotifications']) ? 1 : 0]);
        jsonResponse(['message' => 'Settings saved successfully.']);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'signup') {
        requireFields($body, ['name', 'regNo', 'option']);
        $check = db()->prepare('SELECT id FROM accounts WHERE registration_no = ?');
        $check->execute([trim($body['regNo'])]);
        if ($check->fetch()) jsonResponse(['error' => 'That registration number is already registered.'], 409);
        $stmt = db()->prepare('INSERT INTO accounts (full_name, registration_no, government_unit, photo_data) VALUES (?, ?, ?, ?)');
        $stmt->execute([trim($body['name']), trim($body['regNo']), trim($body['option']), $body['photoData'] ?? null]);
        jsonResponse(['message' => 'Account created. You can sign in now.'], 201);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'signin') {
        requireFields($body, ['role']);
        if ($body['role'] === 'admin') {
            $email = strtolower(trim((string) ($body['email'] ?? '')));
            $password = (string) ($body['password'] ?? '');
            $validStatic = $email === ADMIN_EMAIL && $password === ADMIN_PASSWORD;
            $admin = db()->prepare("SELECT id, full_name AS name, registration_no AS regNo, government_unit AS option, password_hash AS passwordHash, role FROM accounts WHERE email = ? AND role = 'admin' AND status = 'active' LIMIT 1");
            $admin->execute([$email]);
            $admin = $admin->fetch();
            if (!$validStatic && (!$admin || !$admin['passwordHash'] || !password_verify($password, $admin['passwordHash']))) jsonResponse(['error' => 'Administrator credentials were not accepted.'], 401);
            if ($admin) { unset($admin['passwordHash']); db()->prepare('INSERT INTO activity_log (account_id, action) VALUES (?, \'sign_in\')')->execute([(int) $admin['id']]); }
            if ($validStatic && !$admin) $admin = db()->query("SELECT id, full_name AS name, registration_no AS regNo, government_unit AS option, role FROM accounts WHERE role = 'admin' LIMIT 1")->fetch();
            jsonResponse(['account' => $admin ?: ['id' => 0, 'name' => 'Jordan Smith', 'role' => 'admin', 'option' => 'Public Administration']]);
        }
        requireFields($body, ['regNo', 'name']);
        $stmt = db()->prepare("SELECT id, full_name AS name, registration_no AS regNo, government_unit AS option, photo_data AS photoData, role FROM accounts WHERE registration_no = ? AND LOWER(full_name) = LOWER(?) AND role = 'user' AND status = 'active'");
        $stmt->execute([trim($body['regNo']), trim($body['name'])]);
        $account = $stmt->fetch();
        if (!$account) jsonResponse(['error' => 'We could not match those account details.'], 401);
        db()->prepare('INSERT INTO activity_log (account_id, action) VALUES (?, \'sign_in\')')->execute([(int) $account['id']]);
        jsonResponse(['account' => $account]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'draft') {
        $accountId = (int) ($_GET['accountId'] ?? 0);
        $stmt = db()->prepare('SELECT title, content, attachments FROM reports WHERE account_id = ? ORDER BY updated_at DESC LIMIT 1');
        $stmt->execute([$accountId]);
        $draft = $stmt->fetch() ?: ['title' => '', 'content' => '', 'attachments' => []];
        $draft['attachments'] = $draft['attachments'] ? json_decode($draft['attachments'], true) : [];
        jsonResponse(['draft' => $draft]);
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'draft') {
        requireFields($body, ['accountId', 'title', 'content']);
        $stmt = db()->prepare('INSERT INTO reports (account_id, title, content, attachments) VALUES (?, ?, ?, ?)');
        $stmt->execute([(int) $body['accountId'], trim($body['title']), trim($body['content']), json_encode($body['attachments'] ?? [])]);
        jsonResponse(['message' => 'Draft saved successfully.'], 201);
    }

    jsonResponse(['error' => 'Unknown API action.'], 404);
} catch (Throwable $error) {
    jsonResponse(['error' => 'Server error. Check the XAMPP PHP/MySQL configuration.'], 500);
}
