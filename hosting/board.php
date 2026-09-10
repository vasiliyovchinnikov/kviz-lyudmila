<?php
/**
 * Leaderboard API для квиза ludatsoy.ru
 * PHP 5.4-совместимый (хостинг reg.ru Host-A, fcgi_apache, native 5.4).
 * Хранилище: JSON-файл рядом. Атомарная запись через tmp+rename.
 *
 * Эндпоинты:
 *   GET  board.php           -> {"ok":true,"records":[...]}
 *   POST board.php  {"name":..., "score":N, "max":N}  -> добавить запись
 *   DELETE не реализован (записи удаляются вручную через правку файла по FTP)
 *
 * Защита: мягкая валидация + rate-limit по файлу, токен записи не требуется
 * (данные не персональные: имя + счёт).
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('Access-Control-Allow-Origin: https://ludatsoy.ru');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Board-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

define('DATA_FILE', __DIR__ . '/data/board.json');
define('DATA_DIR',  __DIR__ . '/data');
define('MAX_RECORDS', 100);
define('MAX_NAME_LEN', 40);
// Токен модерации лежит ВНЕ docroot: /board_secret в корне FTP-аккаунта
define('SECRET_FILE', dirname(__DIR__) . '/board_secret');

function fail($code, $msg) {
    http_response_code($code);
    echo json_encode(array('ok' => false, 'error' => $msg));
    exit;
}

function ensureDataDir() {
    if (!is_dir(DATA_DIR)) {
        if (!mkdir(DATA_DIR, 0755, true)) fail(500, 'cannot create data dir');
    }
}

function loadBoard() {
    if (!file_exists(DATA_FILE)) return array();
    $fp = fopen(DATA_FILE, 'r');
    if (!$fp) fail(500, 'cannot open data file');
    flock($fp, LOCK_SH);
    $raw = stream_get_contents($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    $data = json_decode($raw, true);
    return is_array($data) ? $data : array();
}

function saveBoard($records) {
    ensureDataDir();
    $json = json_encode(array_values($records));
    if ($json === false) fail(500, 'encode error');
    $tmp = DATA_FILE . '.tmp';
    if (file_put_contents($tmp, $json, LOCK_EX) === false) fail(500, 'write error');
    if (!rename($tmp, DATA_FILE)) fail(500, 'rename error');
}

function normalizeRec($r) {
    if (!is_array($r)) return null;
    if (!isset($r['name'], $r['score'], $r['ts'])) return null;
    $name = trim((string)$r['name']);
    if ($name === '' || mb_strlen($name) > MAX_NAME_LEN) return null;
    if (!is_numeric($r['score'])) return null;
    $rec = array(
        'name'  => $name,
        'score' => (int)$r['score'],
        'ts'    => (string)$r['ts'],
    );
    if (isset($r['max']) && is_numeric($r['max'])) $rec['max'] = (int)$r['max'];
    return $rec;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $records = loadBoard();
    usort($records, 'sortRec');
    echo json_encode(array('ok' => true, 'records' => $records));
    exit;
}

if ($method === 'POST') {
    // мягкий rate-limit: не более 1 записи с IP в 10 секунд
    $ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown';
    $rlFile = sys_get_temp_dir() . '/board_rl_' . md5($ip);
    if (file_exists($rlFile) && (time() - (int)filemtime($rlFile)) < 10) {
        fail(429, 'too many requests');
    }
    @touch($rlFile);

    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) fail(400, 'invalid json');
    $rec = normalizeRec($body);
    if ($rec === null) fail(422, 'invalid record');

    $records = loadBoard();
    // дедуп по ts
    foreach ($records as $r) {
        if (isset($r['ts']) && $r['ts'] === $rec['ts']) {
            echo json_encode(array('ok' => true, 'duplicate' => true, 'records' => $records));
            exit;
        }
    }
    $records[] = $rec;
    usort($records, 'sortRec');
    if (count($records) > MAX_RECORDS) $records = array_slice($records, 0, MAX_RECORDS);
    saveBoard($records);
    echo json_encode(array('ok' => true, 'records' => $records));
    exit;
}

function sortRec($a, $b) {
    $sa = isset($a['max']) && $a['max'] ? $a['score'] / $a['max'] : $a['score'];
    $sb = isset($b['max']) && $b['max'] ? $b['score'] / $b['max'] : $b['score'];
    if ($sb == $sa) return ($b['score'] < $a['score']) ? -1 : 1;
    return ($sb < $sa) ? -1 : 1;
}

// timing-safe сверка строк (hash_equals появился только в PHP 5.6)
function safeStrEq($known, $given) {
    if (!is_string($known) || !is_string($given)) return false;
    $kl = strlen($known);
    if ($kl !== strlen($given)) return false;
    $diff = 0;
    for ($i = 0; $i < $kl; $i++) { $diff |= ord($known[$i]) ^ ord($given[$i]); }
    return $diff === 0;
}

// Модерация: DELETE board.php?ts=<ts> | ts=all + заголовок X-Board-Token
if ($method === 'DELETE') {
    $given = isset($_SERVER['HTTP_X_BOARD_TOKEN']) ? (string)$_SERVER['HTTP_X_BOARD_TOKEN'] : '';
    if ($given === '' || !is_readable(SECRET_FILE)) fail(403, 'forbidden');
    $known = trim((string)file_get_contents(SECRET_FILE));
    if ($known === '' || !safeStrEq($known, $given)) fail(403, 'forbidden');
    $ts = isset($_GET['ts']) ? (string)$_GET['ts'] : '';
    if ($ts === '' || strlen($ts) > 64) fail(422, 'ts required');
    if ($ts === 'all') {
        saveBoard(array());
        echo json_encode(array('ok' => true, 'deleted' => -1));
        exit;
    }
    $records = loadBoard();
    $kept = array();
    $deleted = 0;
    foreach ($records as $r) {
        if (isset($r['ts']) && (string)$r['ts'] === $ts) { $deleted++; continue; }
        $kept[] = $r;
    }
    if ($deleted > 0) saveBoard($kept);
    echo json_encode(array('ok' => true, 'deleted' => $deleted));
    exit;
}

fail(405, 'method not allowed');
