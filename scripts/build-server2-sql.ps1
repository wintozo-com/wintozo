$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$files = @(
  'sql\winchat_setup.sql',
  'sql\winchat_winpro.sql',
  'sql\winchat_update_2.sql',
  'sql\winchat_update_3.sql',
  'sql\winchat_update_4.sql',
  'sql\winchat_update_4_fix.sql',
  'sql\winchat_update_5.sql',
  'sql\winchat_update_6.sql',
  'sql\winchat_update_7.sql',
  'sql\winchat_update_9.sql',
  'sql\winchat_update_10_ota.sql',
  'sql\winchat_update_10_push.sql',
  'sql\winchat_update_12_cleanup.sql',
  'sql\winchat_update_13_channels.sql',
  'sql\winchat_update_14_ota_prerelease.sql',
  'sql\winchat_update_15_stickers_text.sql',
  'sql\winchat_update_16_invites.sql',
  'sql\winchat_update_17_ota_desc.sql',
  'sql\winchat_update_18_glass.sql',
  'sql\winchat_update_19_oobe_version.sql',
  'sql\winchat_update_20_ota_rebuild.sql',
  'sql\winchat_update_21_ota7_note.sql',
  'sql\winchat_update_22_beta_ota.sql',
  'sql\winchat_update_23_server_balancing.sql',
  'supabase\migrations\20260320_add_is_winchat_legacy.sql'
)

$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine('-- ============================================================')
[void]$sb.AppendLine('-- Cordy 8.0.0-closed-beta - FULL SCHEMA FOR SERVER 2')
[void]$sb.AppendLine('-- Project: https://bjsjvozhkjktowqizidj.supabase.co')
[void]$sb.AppendLine('-- Run entirely in Dashboard -> SQL Editor -> New query -> Run')
[void]$sb.AppendLine('-- Server 2 accepts ~half of registrations, but every account is')
[void]$sb.AppendLine('-- mirrored to server 1, where ALL shared data lives: profiles,')
[void]$sb.AppendLine('-- chats, messages, OTA. Users of both servers see each other')
[void]$sb.AppendLine('-- and can be members of the same groups.')
[void]$sb.AppendLine('-- IMPORTANT: disable Confirm email in Auth -> Providers -> Email')
[void]$sb.AppendLine('-- Idempotent: safe to run more than once.')
[void]$sb.AppendLine('-- ============================================================')

foreach ($f in $files) {
  $p = Join-Path $root $f
  [void]$sb.AppendLine()
  [void]$sb.AppendLine('-- ------------------------------------------------------------')
  [void]$sb.AppendLine('-- FILE: ' + $f)
  [void]$sb.AppendLine('-- ------------------------------------------------------------')
  [void]$sb.AppendLine((Get-Content -Path $p -Raw -Encoding UTF8))
}

$out = Join-Path $root 'sql\winchat_server2_full.sql'
[System.IO.File]::WriteAllText($out, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))
Get-Item $out | Select-Object FullName,Length
