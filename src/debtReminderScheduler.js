"use strict";

const { db } = require("./firebaseService");
const { FCMV1Service } = require("./fcmService");
const config = require("./config");

class DebtReminderScheduler {
  constructor(fcmService) {
    this.fcmService = fcmService;
    this.reminderDays = [3, 1]; // Check for debts due in 3 days and 1 day
  }

  /**
   * Check for debts due in X days and send reminder notifications
   */
  async checkUpcomingDebts() {
    console.log("[DEBT_REMINDER] 🔍 Checking for upcoming debts...");

    try {
      if (!db) {
        console.error("[DEBT_REMINDER] ❌ Firebase database not initialized");
        return;
      }

      // Get today's date at midnight for accurate day calculations
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      // Get all users with FCM tokens
      const fcmTokensRef = db.ref("fcm_tokens");
      const fcmTokensSnapshot = await fcmTokensRef.once("value");
      const fcmTokens = fcmTokensSnapshot.val();

      if (!fcmTokens) {
        console.log("[DEBT_REMINDER] No FCM tokens found");
        return;
      }

      // Get all user debts
      const userDebtsRef = db.ref("UserDebts");
      const userDebtsSnapshot = await userDebtsRef.once("value");
      const userDebts = userDebtsSnapshot.val();

      if (!userDebts) {
        console.log("[DEBT_REMINDER] No user debts found");
        return;
      }

      let notificationsSent = 0;
      const usersNotified = [];

      for (const [userId, fcmToken] of Object.entries(fcmTokens)) {
        if (!fcmToken) {
          continue;
        }

        // Get user's debts
        const userDebtsData = userDebts[userId];
        if (!userDebtsData) {
          continue;
        }

        // Collect debts due in reminder_days
        const upcomingDebtsByDays = {}; // {3: [debts], 1: [debts]}

        for (const [phoneNumber, debtorData] of Object.entries(userDebtsData)) {
          if (phoneNumber === "metadata") {
            continue;
          }

          const debts = debtorData.debts || {};
          if (!debts || Object.keys(debts).length === 0) {
            continue;
          }

          for (const [debtId, debt] of Object.entries(debts)) {
            if (debt.isComplete) {
              continue;
            }

            const debtDate = debt.date;
            if (!debtDate) {
              continue;
            }

            try {
              // Try to parse date in multiple formats
              let debtDateObj = null;
              const dateFormats = [
                "%Y-%m-%d", // 2025-11-07
                "%d/%m/%Y", // 07/11/2025
                "%m/%d/%Y", // 11/07/2025 (US format)
                "%d-%m-%Y", // 07-11-2025
                "%Y/%m/%d", // 2025/11/07
              ];

              for (const dateFormat of dateFormats) {
                try {
                  // Simple date parsing (Node.js doesn't have strptime, use manual parsing)
                  debtDateObj = this._parseDate(debtDate, dateFormat);
                  if (debtDateObj) {
                    break;
                  }
                } catch (e) {
                  continue;
                }
              }

              if (!debtDateObj) {
                console.warn(
                  `[DEBT_REMINDER] Could not parse date format for debt ${debtId}: ${debtDate}`
                );
                continue;
              }

              // Normalize debt date to midnight for accurate day calculation
              debtDateObj.setUTCHours(0, 0, 0, 0);

              // Calculate days until due
              const daysUntilDue = Math.floor(
                (debtDateObj.getTime() - today.getTime()) /
                  (1000 * 60 * 60 * 24)
              );

              // Check if debt is due in one of our reminder days
              if (this.reminderDays.includes(daysUntilDue)) {
                const debtInfo = {
                  id: debtId,
                  account_name: debtorData.accountName || "Unknown",
                  account_phone: phoneNumber,
                  amount: debt.debtAmount || "0",
                  due_date: debtDate,
                  description: debt.description || "",
                  days_until_due: daysUntilDue,
                };

                if (!upcomingDebtsByDays[daysUntilDue]) {
                  upcomingDebtsByDays[daysUntilDue] = [];
                }
                upcomingDebtsByDays[daysUntilDue].push(debtInfo);
              }
            } catch (e) {
              console.warn(
                `[DEBT_REMINDER] Invalid date format for debt ${debtId}: ${debtDate}`
              );
              continue;
            }
          }
        }

        // Send notifications for each reminder day
        for (const [daysUntilDue, debtsList] of Object.entries(
          upcomingDebtsByDays
        )) {
          if (debtsList && debtsList.length > 0) {
            const success = await this._sendDebtReminderNotification(
              fcmToken,
              userId,
              debtsList,
              parseInt(daysUntilDue)
            );
            if (success) {
              notificationsSent++;
              if (!usersNotified.includes(userId)) {
                usersNotified.push(userId);
              }
              console.log(
                `[DEBT_REMINDER] ✅ Sent ${daysUntilDue}-day reminder for ${debtsList.length} debt(s) to user ${userId}`
              );
            }
          }
        }
      }

      console.log(
        `[DEBT_REMINDER] 📤 Sent ${notificationsSent} debt reminder notifications to ${usersNotified.length} users`
      );
    } catch (error) {
      console.error(
        `[DEBT_REMINDER] ❌ Error checking upcoming debts: ${error.message}`
      );
      console.error(error.stack);
    }
  }

  /**
   * Parse date string with given format
   */
  _parseDate(dateString, format) {
    try {
      // Handle different date formats
      if (format === "%Y-%m-%d") {
        // 2025-11-07
        const parts = dateString.split("-");
        if (parts.length === 3) {
          return new Date(
            parseInt(parts[0]),
            parseInt(parts[1]) - 1,
            parseInt(parts[2])
          );
        }
      } else if (format === "%d/%m/%Y") {
        // 07/11/2025
        const parts = dateString.split("/");
        if (parts.length === 3) {
          return new Date(
            parseInt(parts[2]),
            parseInt(parts[1]) - 1,
            parseInt(parts[0])
          );
        }
      } else if (format === "%m/%d/%Y") {
        // 11/07/2025 (US format)
        const parts = dateString.split("/");
        if (parts.length === 3) {
          return new Date(
            parseInt(parts[2]),
            parseInt(parts[0]) - 1,
            parseInt(parts[1])
          );
        }
      } else if (format === "%d-%m-%Y") {
        // 07-11-2025
        const parts = dateString.split("-");
        if (parts.length === 3) {
          return new Date(
            parseInt(parts[2]),
            parseInt(parts[1]) - 1,
            parseInt(parts[0])
          );
        }
      } else if (format === "%Y/%m/%d") {
        // 2025/11/07
        const parts = dateString.split("/");
        if (parts.length === 3) {
          return new Date(
            parseInt(parts[0]),
            parseInt(parts[1]) - 1,
            parseInt(parts[2])
          );
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Send debt reminder notification to a user
   */
  async _sendDebtReminderNotification(fcmToken, userId, debts, daysUntilDue) {
    try {
      // Calculate total amount
      let totalAmount = 0.0;
      for (const debt of debts) {
        try {
          const amount = parseFloat(debt.amount || "0");
          totalAmount += amount;
        } catch (e) {
          // Ignore invalid amounts
        }
      }

      // Create notification message based on days until due
      let title, body;
      if (daysUntilDue === 3) {
        if (debts.length === 1) {
          const debt = debts[0];
          title = "📅 Debt Reminder: 3 Days Left";
          body = `Debt from ${debt.account_name} is due in 3 days. Amount: KSh ${debt.amount}`;
        } else {
          title = `📅 ${debts.length} Debts Due in 3 Days`;
          body = `You have ${
            debts.length
          } debts due in 3 days. Total: KSh ${totalAmount.toFixed(2)}`;
        }
      } else if (daysUntilDue === 1) {
        if (debts.length === 1) {
          const debt = debts[0];
          title = "⏰ Debt Due Tomorrow!";
          body = `Debt from ${debt.account_name} is due tomorrow. Amount: KSh ${debt.amount}`;
        } else {
          title = `⏰ ${debts.length} Debts Due Tomorrow!`;
          body = `You have ${
            debts.length
          } debts due tomorrow. Total: KSh ${totalAmount.toFixed(2)}`;
        }
      } else {
        // Generic reminder
        if (debts.length === 1) {
          const debt = debts[0];
          title = `📅 Debt Reminder: ${daysUntilDue} Days Left`;
          body = `Debt from ${debt.account_name} is due in ${daysUntilDue} days. Amount: KSh ${debt.amount}`;
        } else {
          title = `📅 ${debts.length} Debts Due in ${daysUntilDue} Days`;
          body = `You have ${
            debts.length
          } debts due in ${daysUntilDue} days. Total: KSh ${totalAmount.toFixed(
            2
          )}`;
        }
      }

      // Prepare notification data
      const notificationData = {
        type: "debt_reminder",
        user_id: userId,
        days_until_due: String(daysUntilDue),
        debt_count: String(debts.length),
        total_amount: String(totalAmount),
        timestamp: String(Math.floor(Date.now() / 1000)),
        notification_type: "debt_reminder",
        debts: JSON.stringify(debts),
        click_action: "com.jeff.kilekitabu.DEBT_NOTIFICATION",
      };

      // Send notification using FCM service
      const success = await this.fcmService.sendNotification(
        fcmToken,
        title,
        body,
        notificationData
      );

      return success;
    } catch (error) {
      console.error(
        `[DEBT_REMINDER] ❌ Error sending debt reminder notification to user ${userId}: ${error.message}`
      );
      return false;
    }
  }
}

module.exports = DebtReminderScheduler;
