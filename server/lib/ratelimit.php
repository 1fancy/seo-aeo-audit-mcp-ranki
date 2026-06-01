<?php
declare(strict_types=1);

/**
 * File-based per-IP rate limit for unauthenticated MCP advisor calls.
 * 5 calls per IP per UTC day. Files stored under /tmp/ranki-mcp-rl/.
 * Simple, no DB roundtrip, fast enough for our scale.
 *
 * Returns a tuple with the new state so the dispatcher can render a
 * human-warm rate-limit message and emit X-RateLimit headers.
 */

const RK_MCP_FREE_LIMIT = 5;

/**
 * @return array{allowed: bool, used: int, limit: int, reset_at: string, seconds_until_reset: int}
 */
function rk_mcp_check_ip(string $ip): array
{
    $dir = sys_get_temp_dir().'/ranki-mcp-rl';
    if (! is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }

    $day = gmdate('Y-m-d');
    $file = $dir.'/'.sha1($ip.'|'.$day);

    $count = is_file($file) ? (int) file_get_contents($file) : 0;
    $allowed = $count < RK_MCP_FREE_LIMIT;

    if ($allowed) {
        @file_put_contents($file, (string) ($count + 1));
        $count++;
    }

    // Reset is the next UTC midnight.
    $tomorrow = gmmktime(0, 0, 0, (int) gmdate('n'), (int) gmdate('j') + 1, (int) gmdate('Y'));

    return [
        'allowed' => $allowed,
        'used' => $count,
        'limit' => RK_MCP_FREE_LIMIT,
        'reset_at' => gmdate('Y-m-d\TH:i:s\Z', $tomorrow),
        'seconds_until_reset' => max(0, $tomorrow - time()),
    ];
}

/**
 * Backward-compat for callers that only need the boolean.
 */
function rk_mcp_allow_ip(string $ip): bool
{
    return rk_mcp_check_ip($ip)['allowed'];
}

/**
 * Pretty "X hours Y minutes" formatting for the reset message.
 */
function rk_mcp_format_reset(int $seconds): string
{
    if ($seconds < 60) {
        return $seconds.'s';
    }
    $h = intdiv($seconds, 3600);
    $m = intdiv($seconds % 3600, 60);
    if ($h === 0) {
        return $m.'m';
    }

    return $h.'h '.$m.'m';
}
