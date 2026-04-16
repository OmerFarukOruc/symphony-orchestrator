import type { AlertHistoryStorePort } from "../../alerts/history-store.js";
import type { AutomationStorePort } from "../../automation/port.js";
import type { NotificationStorePort } from "../../notification/port.js";
import type { RisolutoDatabase } from "./database.js";
import { AlertHistoryStore } from "./alert-history-store.js";
import { AutomationStore } from "./automation-store.js";
import { NotificationStore } from "./notification-store.js";

export interface OperatorPersistence {
  notificationStore: NotificationStorePort;
  automationStore: AutomationStorePort;
  alertHistoryStore: AlertHistoryStorePort;
}

export function createOperatorPersistence(db: RisolutoDatabase): OperatorPersistence {
  return {
    notificationStore: NotificationStore.create(db),
    automationStore: AutomationStore.create(db),
    alertHistoryStore: AlertHistoryStore.create(db),
  };
}
