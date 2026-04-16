// WHY divergent from src/core/notification-types.ts: the frontend and backend are
// separate build targets that cannot share imports. These interfaces mirror the
// wire-format shapes returned by the /api/v1/notifications endpoint. The backend's
// NotificationSeverity type alias is inlined here as a union to avoid coupling.
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
