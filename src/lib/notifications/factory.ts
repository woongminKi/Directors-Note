import { AlimTalkChannel } from "@/lib/notifications/alimtalk-channel";
import type {
	NotificationChannel,
	NotificationChannelName,
} from "@/lib/notifications/types";
import { WebPushChannel } from "@/lib/notifications/web-push-channel";

export function createNotificationChannel(
	channel: NotificationChannelName,
): NotificationChannel {
	switch (channel) {
		case "web_push":
			return new WebPushChannel();
		case "alimtalk":
			return new AlimTalkChannel();
	}
}
