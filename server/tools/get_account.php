<?php
declare(strict_types=1);

/**
 * get_account — whoami for Ranki.io API keys.
 *
 * Best first call after a user pastes a key into their MCP client. Confirms
 * the key works and shows the account snapshot (plan, limits, usage). On
 * key failure rk_mcp_api_call throws with a precise human message — we let
 * that propagate so the user sees "your key is invalid, click here to fix".
 */
return function (array $args, string $apiKey): array {
    $resp = rk_mcp_api_call('/api/v1/me', $apiKey);

    $name = $resp['name'] ?? '(no name)';
    $email = $resp['email'] ?? '(no email)';
    $plan = $resp['plan'] ?? 'unknown';
    $status = $resp['subscription_status'] ?? 'unknown';
    $onTrial = ! empty($resp['on_trial']);

    $limits = $resp['limits'] ?? [];
    $usage = $resp['usage'] ?? [];

    $projects = (int) ($usage['projects'] ?? 0);
    $projectsLimit = (int) ($limits['projects'] ?? 0);
    $postsThisMonth = $usage['posts_this_month'] ?? null;
    $postsPerMonth = (int) ($limits['posts_per_month'] ?? 0);
    $postsPerDay = (int) ($limits['posts_per_day'] ?? 0);

    $statusLine = $onTrial ? "{$plan} (trial)" : $plan;
    if ($status === 'canceled') {
        $statusLine .= ' · canceled';
    } elseif ($status === 'past_due') {
        $statusLine .= ' · past due';
    }

    $out = "✓ API key verified — connected to Ranki.io.\n\n";
    $out .= "Account\n";
    $out .= "  Name:    {$name}\n";
    $out .= "  Email:   {$email}\n";
    $out .= "  Plan:    {$statusLine}\n\n";

    $out .= "Daily and monthly limits\n";
    $out .= '  Articles/day:   '.($postsPerDay > 0 ? $postsPerDay : 'n/a')."\n";
    $out .= '  Articles/month: '.($postsPerMonth > 0 ? $postsPerMonth : 'n/a').
        ($postsThisMonth !== null ? " (used: {$postsThisMonth})" : '')."\n";
    $out .= "  Projects:       {$projects} of ".($projectsLimit > 0 ? $projectsLimit : '∞')."\n\n";

    $out .= "Next steps\n";
    if ($projects === 0) {
        $out .= "  • You don't have any projects yet — create one at https://app.ranki.io/projects\n";
    } else {
        $out .= "  • Call `list_projects` to see what's in your account\n";
    }
    $out .= "  • Manage your key (regenerate / reveal): https://app.ranki.io/developer\n";

    return rk_mcp_text_content($out);
};
