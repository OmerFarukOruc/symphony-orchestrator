export interface NotificationDeliveryFailure {
  channel: string;
  error: string;
}

export interface NotificationDeliverySummary {
  deliveredChannels: string[];
  failedChannels: NotificationDeliveryFailure[];
  skippedDuplicate: boolean;
}

export interface NotificationRecord {
  id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  source: string | null;
  href: string | null;
  read: boolean;
  dedupeKey: string | null;
  metadata: Record<string, unknown> | null;
  deliverySummary: NotificationDeliverySummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationsListResponse {
  notifications: NotificationRecord[];
  unreadCount: number;
  totalCount: number;
}

export interface NotificationReadResponse {
  ok: true;
  notification: NotificationRecord;
  unreadCount: number;
}

export interface NotificationsReadAllResponse {
  ok: true;
  updatedCount: number;
  unreadCount: number;
}
