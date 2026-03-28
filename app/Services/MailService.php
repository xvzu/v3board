<?php

namespace App\Services;

use App\Jobs\SendEmailJob;
use App\Models\User;
use App\Utils\CacheKey;
use Illuminate\Support\Facades\Cache;

class MailService
{
    /**
     * 到期提醒：提前多少秒开始发通知（由后台「到期提醒提前天数」配置）
     */
    public static function expireRemindLeadSeconds(): int
    {
        $days = max(1, (int)config('v2board.remind_expire_days', 1));

        return $days * 86400;
    }

    public static function trafficRemindPercent(): int
    {
        $p = (int)config('v2board.remind_traffic_percent', 95);

        return max(1, min(100, $p));
    }

    public function sendTelegramNotification(User $user, string $message)
    {
        if ($user->telegram_id) {
            $telegramService = new TelegramService();
            $telegramService->sendMessage($user->telegram_id, $message);
        }
    }

    /**
     * 同一到期日各渠道最多提醒一次（避免提前 N 天 + 每日任务导致连发 N 封）；续费后 expired_at 变化会再次提醒。
     */
    private function expireRemindCacheTtl(User $user): int
    {
        if ($user->expired_at === null) {
            return 60;
        }

        return max(60, $user->expired_at - time());
    }

    public function shouldSkipExpireEmail(User $user): bool
    {
        if ($user->expired_at === null) {
            return true;
        }
        $cached = Cache::get(CacheKey::get('LAST_SEND_EMAIL_REMIND_EXPIRE_EMAIL', $user->id));

        return $cached !== null && (int) $cached === (int) $user->expired_at;
    }

    public function shouldSkipExpireTelegram(User $user): bool
    {
        if ($user->expired_at === null) {
            return true;
        }
        $cached = Cache::get(CacheKey::get('LAST_SEND_EMAIL_REMIND_EXPIRE_TELEGRAM', $user->id));

        return $cached !== null && (int) $cached === (int) $user->expired_at;
    }

    public function markExpireEmailSent(User $user): void
    {
        if ($user->expired_at === null) {
            return;
        }
        Cache::put(CacheKey::get('LAST_SEND_EMAIL_REMIND_EXPIRE_EMAIL', $user->id), $user->expired_at, $this->expireRemindCacheTtl($user));
    }

    public function markExpireTelegramSent(User $user): void
    {
        if ($user->expired_at === null) {
            return;
        }
        Cache::put(CacheKey::get('LAST_SEND_EMAIL_REMIND_EXPIRE_TELEGRAM', $user->id), $user->expired_at, $this->expireRemindCacheTtl($user));
    }

    public function remindTrafficIsWarnValue($u, $d, $transferEnable): bool
    {
        if ($transferEnable <= 0) {
            return false;
        }
        $percent = self::trafficRemindPercent();
        $used = $u + $d;

        return ($used / $transferEnable) >= ($percent / 100);
    }

    public function remindTraffic(User $user)
    {
        if (!$user->remind_traffic) {
            return;
        }
        if (!$this->remindTrafficIsWarnValue($user->u, $user->d, $user->transfer_enable)) {
            return;
        }
        $flag = CacheKey::get('LAST_SEND_EMAIL_REMIND_TRAFFIC', $user->id);
        if (Cache::get($flag)) {
            return;
        }
        if (!Cache::put($flag, 1, 24 * 3600)) {
            return;
        }

        $percent = self::trafficRemindPercent();

        SendEmailJob::dispatch([
            'email' => $user->email,
            'subject' => __('The traffic usage in :app_name has reached :percent%', [
                'app_name' => config('v2board.app_name', 'V2board'),
                'percent' => (string) $percent,
            ]),
            'template_name' => 'remindTraffic',
            'template_value' => [
                'name' => config('v2board.app_name', 'V2Board'),
                'url' => config('v2board.app_url'),
                'traffic_percent' => $percent,
            ],
        ]);

        if ($user->telegram_id) {
            $message = "⚠️ 您的流量使用已达到{$percent}%，请及时充值。\n\n💡 当前已使用流量：{$this->formatTraffic($user->u + $user->d)}\n📊 总流量：{$this->formatTraffic($user->transfer_enable)}";
            $this->sendTelegramNotification($user, $message);
        }
    }

    public function remindExpire(User $user)
    {
        $lead = self::expireRemindLeadSeconds();
        if (!($user->expired_at !== null && ($user->expired_at - $lead) < time() && $user->expired_at > time())) {
            return;
        }
        $days = max(1, (int)config('v2board.remind_expire_days', 1));

        if (!$this->shouldSkipExpireEmail($user)) {
            SendEmailJob::dispatch([
                'email' => $user->email,
                'subject' => __('The service in :app_name is about to expire', [
                    'app_name' => config('v2board.app_name', 'V2board'),
                ]),
                'template_name' => 'remindExpire',
                'template_value' => [
                    'name' => config('v2board.app_name', 'V2Board'),
                    'url' => config('v2board.app_url'),
                    'expire_in_days' => $days,
                ],
            ]);
            $this->markExpireEmailSent($user);
        }

        if ($user->telegram_id && !$this->shouldSkipExpireTelegram($user)) {
            $expireDate = date('Y-m-d', $user->expired_at);
            $message = "⏰ 您的服务即将到期（{$days} 天内），请及时续费。\n\n📅 到期时间：{$expireDate}";
            $this->sendTelegramNotification($user, $message);
            $this->markExpireTelegramSent($user);
        }
    }

    public function formatTraffic($bytes)
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $bytes = max($bytes, 0);
        $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
        $pow = min($pow, count($units) - 1);
        $bytes /= (1 << (10 * $pow));

        return round($bytes, 2) . ' ' . $units[$pow];
    }
}
