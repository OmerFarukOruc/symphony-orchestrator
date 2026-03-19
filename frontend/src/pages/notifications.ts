import "../styles/notifications.css";

import { buildNotificationsPage } from "./notifications-view";

export function render(): HTMLElement {
  return buildNotificationsPage();
}
