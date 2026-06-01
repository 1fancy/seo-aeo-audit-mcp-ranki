<?php
declare(strict_types=1);

/**
 * list_projects — show what's in the caller's Ranki.io account.
 *
 * Prefixed with the account header so the calling AI always knows whose
 * data it's looking at (avoids confusion when the user is testing with
 * multiple keys, or when the AI is acting across multiple projects).
 */
return function (array $args, string $apiKey): array {
    $perPage = (int) min(50, max(1, (int) ($args['per_page'] ?? 25)));
    $resp = rk_mcp_api_call("/api/v1/projects?per_page={$perPage}", $apiKey);

    $rows = $resp['data'] ?? [];
    $meta = $resp['meta'] ?? [];
    $total = (int) ($meta['total'] ?? count($rows));

    if ($total === 0) {
        return rk_mcp_text_content(
            "No projects in your Ranki.io account yet.\n\n".
            "To create your first project:\n".
            "  1. Visit https://app.ranki.io/projects\n".
            "  2. Click \"New project\" and paste your site URL\n".
            "  3. The onboarding wizard scans your site, infers your niche, and queues content\n\n".
            "Once you have a project, this tool will show it here."
        );
    }

    $out = "Your Ranki.io projects ({$total} total):\n\n";
    foreach ($rows as $p) {
        $name = $p['name'] ?? '(unnamed)';
        $nano = $p['id'] ?? '?';
        $url = $p['url'] ?? 'n/a';
        $lang = $p['writing_language'] ?? 'n/a';
        $active = ! empty($p['is_active']);
        $ppd = (int) ($p['posts_per_day'] ?? 0);

        $out .= "▸ {$name}\n";
        $out .= "    id:        {$nano}\n";
        $out .= "    url:       {$url}\n";
        $out .= "    language:  {$lang}\n";
        $out .= "    status:    ".($active ? 'active' : 'paused').
            ($ppd > 0 ? "  ·  {$ppd} article/day" : '').
            "\n\n";
    }

    if (($meta['last_page'] ?? 1) > 1) {
        $out .= "(showing page 1 of {$meta['last_page']} — pass per_page=50 to get more)\n\n";
    }

    $out .= "To inspect a single article, call `get_article` with its id (from /api/v1/projects/{nano_id}/articles).";

    return rk_mcp_text_content($out);
};
