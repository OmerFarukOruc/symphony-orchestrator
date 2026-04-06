import type { Express } from "express";

import type { HttpRouteDeps } from "../route-types.js";
import { handleListAlertHistory } from "../alerts-handler.js";
import { handleListAutomations, handleListAutomationRuns, handleRunAutomation } from "../automations-handler.js";
import {
  handleListNotifications,
  handleMarkAllNotificationsRead,
  handleMarkNotificationRead,
  handleTestSlackNotification,
} from "../notifications-handler.js";
import { methodNotAllowed } from "../route-helpers.js";

export function registerNotificationRoutes(app: Express, deps: HttpRouteDeps): void {
  app
    .route("/api/v1/notifications")
    .get(async (req, res) => {
      await handleListNotifications({ notificationStore: deps.notificationStore }, req, res);
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/v1/notifications/:notification_id/read")
    .post(async (req, res) => {
      await handleMarkNotificationRead({ notificationStore: deps.notificationStore }, req, res);
    })
    .all((_req, res) => {
      methodNotAllowed(res, ["POST"]);
    });

  app
    .route("/api/v1/notifications/read-all")
    .post(async (req, res) => {
      await handleMarkAllNotificationsRead({ notificationStore: deps.notificationStore }, req, res);
    })
    .all((_req, res) => {
      methodNotAllowed(res, ["POST"]);
    });

  app
    .route("/api/v1/notifications/test")
    .post(async (req, res) => {
      await handleTestSlackNotification({ configStore: deps.configStore, logger: deps.logger }, req, res);
    })
    .all((_req, res) => {
      methodNotAllowed(res, ["POST"]);
    });

  app
    .route("/api/v1/automations")
    .get(async (req, res) => {
      await handleListAutomations({ scheduler: deps.automationScheduler }, req, res);
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/v1/automations/runs")
    .get(async (req, res) => {
      await handleListAutomationRuns(
        { scheduler: deps.automationScheduler, automationStore: deps.automationStore },
        req,
        res,
      );
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });

  app
    .route("/api/v1/automations/:automation_name/run")
    .post(async (req, res) => {
      await handleRunAutomation({ scheduler: deps.automationScheduler }, req, res);
    })
    .all((_req, res) => {
      methodNotAllowed(res, ["POST"]);
    });

  app
    .route("/api/v1/alerts/history")
    .get(async (req, res) => {
      await handleListAlertHistory({ alertHistoryStore: deps.alertHistoryStore }, req, res);
    })
    .all((_req, res) => {
      methodNotAllowed(res);
    });
}
