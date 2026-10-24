<?php
/**
 * MADINE / VYBE Platform - Hostinger Server-Side API Reverse Proxy
 * ===============================================================
 * Protects backend privacy: The browser Network tab will ONLY see
 * requests to "https://yourdomain.com/api/...", never exposing your
 * actual backend server URL or hosting provider to anyone.
 */

// Target backend server (kept private on server side)
$TARGET_BACKEND = 'https://madine-backend-onrender-com.onrender.com';

// Turn off display_errors so raw PHP warnings don't break JSON output
ini_set('display_errors', '0');
error_reporting(0);

// Determine the subpath after /api
$requestUri = $_SERVER['REQUEST_URI'] ?? '/api';
$parsedUrl = parse_url($requestUri);
$path = $parsedUrl['path'] ?? '/api';

// Strip leading /api or /api/
$subPath = preg_replace('#^/api/?#i', '', $path);
$targetUrl = rtrim($TARGET_BACKEND, '/') . '/api/' . ltrim($subPath, '/');

// Append original query string if present
if (!empty($parsedUrl['query'])) {
    $targetUrl .= '?' . $parsedUrl['query'];
}

// Forward request method
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Handle CORS preflight directly if necessary
if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Origin: ' . ($_SERVER['HTTP_ORIGIN'] ?? '*'));
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Cookie');
    http_response_code(204);
    exit;
}

// Collect headers to forward
$forwardHeaders = [];
$incomingHeaders = function_exists('getallheaders') ? getallheaders() : [];

// Fallback if getallheaders() is missing in some FastCGI configurations
if (empty($incomingHeaders)) {
    foreach ($_SERVER as $key => $value) {
        if (substr($key, 0, 5) === 'HTTP_') {
            $headerName = str_replace(' ', '-', ucwords(str_replace('_', ' ', strtolower(substr($key, 5)))));
            $incomingHeaders[$headerName] = $value;
        } elseif (in_array($key, ['CONTENT_TYPE', 'CONTENT_LENGTH'])) {
            $headerName = str_replace(' ', '-', ucwords(str_replace('_', ' ', strtolower($key))));
            $incomingHeaders[$headerName] = $value;
        }
    }
}

foreach ($incomingHeaders as $name => $value) {
    $lower = strtolower($name);
    // Skip host and hop-by-hop headers
    if (in_array($lower, ['host', 'content-length', 'connection', 'keep-alive', 'transfer-encoding'])) {
        continue;
    }
    $forwardHeaders[] = "$name: $value";
}

// Forward real visitor IP to backend
$clientIp = $_SERVER['HTTP_CF_CONNECTING_IP'] 
    ?? $_SERVER['HTTP_X_FORWARDED_FOR'] 
    ?? $_SERVER['REMOTE_ADDR'] 
    ?? '';
if ($clientIp) {
    $forwardHeaders[] = "X-Forwarded-For: $clientIp";
}

// Forward raw body
$requestBody = file_get_contents('php://input');

// Initialize cURL
$ch = curl_init($targetUrl);

curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST  => $method,
    CURLOPT_HTTPHEADER     => $forwardHeaders,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER         => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS      => 5,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_TIMEOUT        => 45,
]);

if ($method !== 'GET' && $method !== 'HEAD' && $requestBody !== false && strlen($requestBody) > 0) {
    curl_setopt($ch, CURLOPT_POSTFIELDS, $requestBody);
}

$response = curl_exec($ch);

if ($response === false) {
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'error' => 'Backend gateway connection error',
        'details' => curl_error($ch)
    ]);
    curl_close($ch);
    exit;
}

$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$httpCode   = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// Set outgoing HTTP status code
http_response_code($httpCode);

$rawHeaders = substr($response, 0, $headerSize);
$body       = substr($response, $headerSize);

// Forward response headers (e.g., Set-Cookie, Content-Type)
$headerLines = explode("\r\n", $rawHeaders);
foreach ($headerLines as $line) {
    if (empty($line) || stripos($line, 'HTTP/') === 0) {
        continue;
    }
    $lower = strtolower($line);
    if (stripos($lower, 'transfer-encoding:') === 0 || stripos($lower, 'connection:') === 0) {
        continue;
    }
    if (stripos($lower, 'set-cookie:') === 0) {
        header($line, false); // false preserves multiple Set-Cookie headers
    } else {
        header($line, true);
    }
}

echo $body;
exit;
