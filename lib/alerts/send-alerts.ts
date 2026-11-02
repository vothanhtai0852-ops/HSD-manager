

import {
  supabaseServer,
} from "@/lib/supabase-server";

import {
  buildAlertGroups,
  filterAlertGroupsByProductIds,
} from "@/lib/alerts/build-alert-groups";

import {
  resolveAlertRecipient,
  type AlertSendMode,
} from "@/lib/alerts/resolve-alert-recipient";

import {
  mailer,
  gmailSender,
} from "@/lib/mailer";

import {
  buildAlertEmail,
} from "@/lib/alerts/build-alert-email";

import {
  processAlertResults,
  type RecipientDeliveryResult,
} from "@/lib/alerts/process-alert-results";

import {
  writeAlertLogs,
  type AlertLogInput,
} from "@/lib/alerts/write-alert-logs";



type AlertGroupSendResult = {
  mode: AlertSendMode;
  recipientEmail: string;
  actualRecipientEmail: string;
  success: boolean;
  errorMessage: string | null;
  messageId: string | null;
};


function getErrorMessage(
  error: unknown
): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Không xác định được lỗi gửi email.";
}


function getSendMode(): AlertSendMode {
  const mode =
    process.env.ALERT_SEND_MODE
      ?.trim()
      .toUpperCase();

  if (
    mode !== "TEST" &&
    mode !== "LIVE"
  ) {
    throw new Error(
      "ALERT_SEND_MODE phải là TEST hoặc LIVE."
    );
  }

  return mode;
}


async function sendAlertGroup(
  group: Parameters<
    typeof buildAlertEmail
  >[0],
  today: string
) {
  const recipient =
    resolveAlertRecipient(
      group.recipientEmail
    );

  const email =
    buildAlertEmail(
      group,
      today
    );

  const info =
    await mailer.sendMail({
      from: gmailSender,

      to:
        recipient.actualRecipientEmail,

      subject:
        recipient.mode === "TEST"
          ? `[TEST] ${email.subject}`
          : email.subject,

      html:
        email.html,
    });

  return {
    mode:
      recipient.mode,

    originalRecipientEmail:
      recipient.originalRecipientEmail,

    actualRecipientEmail:
      recipient.actualRecipientEmail,

    messageId:
      info.messageId,
  };
}

    export async function sendAlerts() {
  /*
   * ==================================================
   * 5. XÁC ĐỊNH SEND MODE
   * ==================================================
   */

  let sendMode: AlertSendMode;

  try {
  sendMode =
    getSendMode();
} catch (error) {
  return {
    success: false,
    sendPerformed: false,
    emailsSent: 0,
    message:
      getErrorMessage(error),
  };
}


  /*
   * ==================================================
   * 6. BIẾN THEO DÕI CLAIM
   * ==================================================
   */

  let claimToken:
    | string
    | null = null;

  let claimedProductIds:
    string[] = [];

  let sendingStarted = false;


  try {
    /*
     * ==================================================
     * 7. BUILD ALERT GROUPS
     * ==================================================
     */

    const alertBuild =
      await buildAlertGroups();


    const candidateProductIds =
      Array.from(
        new Set(
          alertBuild.groups.flatMap(
            (group) =>
              group.products.map(
                (product) =>
                  product.id
              )
          )
        )
      );


    /*
     * ==================================================
     * 8. KHÔNG CÓ PRODUCT CẦN BÁO
     * ==================================================
     */

    if (
      candidateProductIds.length ===
      0
    ) {
      return {
        success: true,
        mode: sendMode,
        sendPerformed: false,
        emailsSent: 0,
        emailsFailed: 0,

        candidateProductCount: 0,
        claimedProductCount: 0,
        completedProductCount: 0,
        failedProductCount: 0,
        releasedProductCount: 0,

        alertLogsPrepared: 0,
        alertLogsWritten: 0,

        today:
          alertBuild.today,

        summary:
          alertBuild.summary,

        message:
          "Không có sản phẩm cần gửi cảnh báo.",
      };
    }


    /*
     * ==================================================
     * 9. CLAIM PRODUCT
     * ==================================================
     */

    claimToken =
      crypto.randomUUID();


    const {
      data: claimRows,
      error: claimError,
    } =
      await supabaseServer.rpc(
        "claim_alert_products",
        {
          p_product_ids:
            candidateProductIds,

          p_claim_token:
            claimToken,

          p_stale_after_minutes:
            15,
        }
      );


    if (claimError) {
      console.error(
        "CLAIM_ALERT_PRODUCTS_ERROR:",
        claimError
      );

      throw new Error(
        "Không thể claim sản phẩm cảnh báo."
      );
    }


    claimedProductIds =
      (
        claimRows ??
        []
      )
        .map(
          (
            row: {
              product_id: string;
            }
          ) =>
            row.product_id
        )
        .filter(Boolean);


    /*
     * ==================================================
     * 10. KHÔNG CLAIM ĐƯỢC PRODUCT
     * ==================================================
     */

    if (
      claimedProductIds.length ===
      0
    ) {
      claimToken = null;

      return {
        success: true,
        mode: sendMode,
        sendPerformed: false,
        emailsSent: 0,
        emailsFailed: 0,

        candidateProductCount:
          candidateProductIds.length,

        claimedProductCount: 0,
        completedProductCount: 0,
        failedProductCount: 0,
        releasedProductCount: 0,

        alertLogsPrepared: 0,
        alertLogsWritten: 0,

        today:
          alertBuild.today,

        summary:
          alertBuild.summary,

        message:
          "Không claim được sản phẩm nào. Có thể một tiến trình khác đang xử lý cảnh báo.",
      };
    }


    /*
     * ==================================================
     * 11. GIỮ GROUP CỦA PRODUCT ĐÃ CLAIM
     * ==================================================
     */

    const claimedGroups =
      filterAlertGroupsByProductIds(
        alertBuild.groups,
        claimedProductIds
      );


    /*
     * ==================================================
     * 12. BIẾN KẾT QUẢ
     * ==================================================
     */

    const deliveryResults:
      RecipientDeliveryResult[] = [];

    const groupSendResults:
      AlertGroupSendResult[] = [];

    const alertLogEntries:
      AlertLogInput[] = [];


    /*
     * ==================================================
     * 13. GỬI EMAIL
     * ==================================================
     */

    sendingStarted = true;


    for (
      const group of
      claimedGroups
    ) {
      /*
       * Resolve trước try-send để kể cả khi SMTP lỗi,
       * response vẫn biết email thực tế định gửi tới đâu.
       */
      let resolvedRecipient:
        ReturnType<
          typeof resolveAlertRecipient
        >;

      try {
        resolvedRecipient =
          resolveAlertRecipient(
            group.recipientEmail
          );
      } catch (error) {
        const errorMessage =
          getErrorMessage(error);

        deliveryResults.push({
          recipientEmail:
            group.recipientEmail,

          success: false,
        });

        groupSendResults.push({
          mode: sendMode,

          recipientEmail:
            group.recipientEmail,

          actualRecipientEmail:
            "",

          success: false,

          errorMessage,

          messageId: null,
        });

        continue;
      }


      try {
        const result =
          await sendAlertGroup(
            group,
            alertBuild.today
          );


        deliveryResults.push({
          recipientEmail:
            group.recipientEmail,

          success: true,
        });


        groupSendResults.push({
          mode:
            result.mode,

          recipientEmail:
            group.recipientEmail,

          actualRecipientEmail:
            result.actualRecipientEmail,

          success: true,

          errorMessage: null,

          messageId:
            result.messageId ??
            null,
        });
      } catch (error) {
        const errorMessage =
          getErrorMessage(error);


        console.error(
          "ALERT_EMAIL_SEND_ERROR:",
          {
            recipient:
              group.recipientEmail,

            actualRecipient:
              resolvedRecipient
                .actualRecipientEmail,

            mode:
              resolvedRecipient.mode,

            error:
              errorMessage,
          }
        );


        deliveryResults.push({
          recipientEmail:
            group.recipientEmail,

          success: false,
        });


        groupSendResults.push({
          mode:
            resolvedRecipient.mode,

          recipientEmail:
            group.recipientEmail,

          actualRecipientEmail:
            resolvedRecipient
              .actualRecipientEmail,

          success: false,

          errorMessage,

          messageId: null,
        });
      }
    }


    /*
     * ==================================================
     * 14. TÍNH KẾT QUẢ THEO PRODUCT
     * ==================================================
     */

    const {
      completedProductIds,
      failedProductIds,
    } =
      processAlertResults(
        claimedGroups,
        deliveryResults
      );


    /*
     * ==================================================
     * 15. CHUẨN BỊ LOG TRONG RAM
     * ==================================================
     */

    for (
      const group of
      claimedGroups
    ) {
      const normalizedRecipient =
        group.recipientEmail
          .trim()
          .toLowerCase();


      const delivery =
        deliveryResults.find(
          (result) =>
            result
              .recipientEmail
              .trim()
              .toLowerCase() ===
            normalizedRecipient
        );


      const sendResult =
        groupSendResults.find(
          (result) =>
            result
              .recipientEmail
              .trim()
              .toLowerCase() ===
            normalizedRecipient
        );


      for (
        const product of
        group.products
      ) {
        alertLogEntries.push({
          recipientEmail:
            group.recipientEmail,

          product,

          status:
            delivery?.success === true
              ? "SENT"
              : "FAILED",

          errorMessage:
            delivery?.success === true
              ? null
              : (
                  sendResult
                    ?.errorMessage ??
                  "Không xác định được lỗi gửi email."
                ),
        });
      }
    }


    /*
     * ==================================================
     * 16. TEST MODE
     * ==================================================
     *
     * TEST tuyệt đối không thay đổi trạng thái cảnh báo.
     *
     * - không complete_alert_claim
     * - không alert_sent = true
     * - không last_alert_at
     * - không writeAlertLogs
     * - release toàn bộ claim
     */

    if (
      sendMode === "TEST"
    ) {
      const {
        data: releasedRows,
        error: releaseError,
      } =
        await supabaseServer.rpc(
          "release_alert_claim",
          {
            p_claim_token:
              claimToken,

            p_product_ids:
              claimedProductIds,
          }
        );


      if (releaseError) {
        console.error(
          "TEST_RELEASE_ALERT_CLAIM_ERROR:",
          releaseError
        );

        /*
         * Không đặt claimToken = null.
         * Claim được giữ để tránh trạng thái
         * khó đoán nếu DB release thất bại.
         */
      return {
  success: false,

  mode:
    sendMode,

  sendPerformed: true,

  emailsSent:
    groupSendResults.filter(
      (result) =>
        result.success
    ).length,

  emailsFailed:
    groupSendResults.filter(
      (result) =>
        !result.success
    ).length,

  candidateProductCount:
    candidateProductIds.length,

  claimedProductCount:
    claimedProductIds.length,

  completedProductCount: 0,

  failedProductCount:
    failedProductIds.length,

  releasedProductCount: 0,

  alertLogsPrepared:
    alertLogEntries.length,

  alertLogsWritten: 0,

  message:
    "TEST đã gửi email nhưng không thể release claim. Không có sản phẩm nào được đánh dấu đã báo.",
};
      }


      const releasedCount =
        Number(
          releasedRows ?? 0
        );


      /*
       * TEST đã release toàn bộ claim.
       */
      claimToken = null;


      const successfulGroups =
        groupSendResults.filter(
          (result) =>
            result.success
        );


      const failedGroups =
        groupSendResults.filter(
          (result) =>
            !result.success
        );


      return {
        success:
          failedGroups.length ===
          0,

        mode:
          "TEST",

        sendPerformed: true,

        emailsSent:
          successfulGroups.length,

        emailsFailed:
          failedGroups.length,

        candidateProductCount:
          candidateProductIds.length,

        claimedProductCount:
          claimedProductIds.length,

        /*
         * TEST luôn bằng 0.
         */
        completedProductCount: 0,

        /*
         * Đây chỉ là số product có ít nhất
         * một recipient test gửi thất bại.
         */
        failedProductCount:
          failedProductIds.length,

        releasedProductCount:
          releasedCount,

        recipientGroupCount:
          claimedGroups.length,

        alertLogsPrepared:
          alertLogEntries.length,

        /*
         * TEST không ghi production log.
         */
        alertLogsWritten: 0,

        today:
          alertBuild.today,

        summary:
          alertBuild.summary,

        deliveries:
          groupSendResults,

        message:
          "TEST hoàn tất. Email chỉ được gửi về GMAIL_USER. Không thay đổi alert_sent, last_alert_at hoặc alert_logs.",
      };
    }


    /*
     * ==================================================
     * 17. LIVE MODE
     * ==================================================
     *
     * Từ đây trở xuống chắc chắn sendMode === LIVE.
     */


    /*
     * ==================================================
     * 18. COMPLETE PRODUCT THÀNH CÔNG
     * ==================================================
     */

    let completedCount = 0;


    if (
      completedProductIds.length >
      0
    ) {
      const {
        data: completedRows,
        error: completeError,
      } =
        await supabaseServer.rpc(
          "complete_alert_claim",
          {
            p_claim_token:
              claimToken,

            p_product_ids:
              completedProductIds,
          }
        );


      if (completeError) {
        console.error(
          "COMPLETE_ALERT_CLAIM_ERROR:",
          completeError
        );

        /*
         * SMTP đã chạy.
         *
         * Không release các product thành công
         * vì làm vậy có thể khiến lần sau gửi trùng.
         */
        return {
  success: false,

  mode:
    "LIVE",

  sendPerformed: true,

  emailsSent:
    groupSendResults.filter(
      (result) =>
        result.success
    ).length,

  emailsFailed:
    groupSendResults.filter(
      (result) =>
        !result.success
    ).length,

  candidateProductCount:
    candidateProductIds.length,

  claimedProductCount:
    claimedProductIds.length,

  completedProductCount: 0,

  failedProductCount:
    failedProductIds.length,

  releasedProductCount: 0,

  alertLogsWritten: 0,

  message:
    "Email LIVE đã được xử lý nhưng không thể cập nhật trạng thái hoàn tất. Claim được giữ lại để giảm nguy cơ gửi trùng.",
};
      }


      completedCount =
        completedRows?.length ??
        0;
    }


    /*
     * ==================================================
     * 19. RELEASE PRODUCT THẤT BẠI
     * ==================================================
     */

    let releasedCount = 0;


    if (
      failedProductIds.length >
      0
    ) {
      const {
        data: releasedRows,
        error: releaseError,
      } =
        await supabaseServer.rpc(
          "release_alert_claim",
          {
            p_claim_token:
              claimToken,

            p_product_ids:
              failedProductIds,
          }
        );


      if (releaseError) {
        console.error(
          "RELEASE_ALERT_CLAIM_ERROR:",
          releaseError
        );

        return {
  success: false,

  mode:
    "LIVE",

  sendPerformed: true,

  emailsSent:
    groupSendResults.filter(
      (result) =>
        result.success
    ).length,

  emailsFailed:
    groupSendResults.filter(
      (result) =>
        !result.success
    ).length,

  candidateProductCount:
    candidateProductIds.length,

  claimedProductCount:
    claimedProductIds.length,

  completedProductCount:
    completedCount,

  failedProductCount:
    failedProductIds.length,

  releasedProductCount: 0,

  alertLogsWritten: 0,

  message:
    "Email LIVE đã được xử lý nhưng không thể release một số sản phẩm gửi thất bại.",
};
      }


      releasedCount =
        Number(
          releasedRows ?? 0
        );
    }


    /*
     * Các product thuộc claim đã được:
     *
     * - complete
     * hoặc
     * - release
     */
    claimToken = null;


    /*
     * ==================================================
     * 20. GHI ALERT LOG CHỈ TRONG LIVE
     * ==================================================
     *
     * Log thất bại không được phép biến email
     * đã gửi thành "chưa gửi".
     */

    let alertLogsWritten = 0;

    let alertLogError:
      | string
      | null = null;


    try {
      await writeAlertLogs(
        alertLogEntries
      );

      alertLogsWritten =
        alertLogEntries.length;
    } catch (error) {
      alertLogError =
        getErrorMessage(error);

      console.error(
        "WRITE_ALERT_LOGS_ERROR:",
        error
      );
    }


    /*
     * ==================================================
     * 21. LIVE RESPONSE
     * ==================================================
     */

    const successfulGroups =
      groupSendResults.filter(
        (result) =>
          result.success
      );


    const failedGroups =
      groupSendResults.filter(
        (result) =>
          !result.success
      );


    return {
      success:
        failedGroups.length ===
          0 &&
        alertLogError === null,

      mode:
        "LIVE",

      sendPerformed: true,

      emailsSent:
        successfulGroups.length,

      emailsFailed:
        failedGroups.length,

      candidateProductCount:
        candidateProductIds.length,

      claimedProductCount:
        claimedProductIds.length,

      completedProductCount:
        completedCount,

      failedProductCount:
        failedProductIds.length,

      releasedProductCount:
        releasedCount,

      recipientGroupCount:
        claimedGroups.length,

      alertLogsPrepared:
        alertLogEntries.length,

      alertLogsWritten,

      alertLogError,

      today:
        alertBuild.today,

      summary:
        alertBuild.summary,

      deliveries:
        groupSendResults,

      message:
        alertLogError
          ? "Gửi cảnh báo LIVE hoàn tất nhưng ghi alert_logs bị lỗi."
          : failedGroups.length > 0
            ? "Gửi cảnh báo LIVE hoàn tất, nhưng có recipient gửi thất bại."
            : "Gửi cảnh báo LIVE hoàn tất.",
    };
  } catch (error) {
    const errorMessage =
      getErrorMessage(
        error
      );


    console.error(
      "ALERT_SEND_ERROR:",
      error
    );


    /*
     * ==================================================
     * 22. CLEANUP
     * ==================================================
     *
     * Nếu chưa bắt đầu SMTP:
     * release claim được.
     *
     * Nếu SMTP đã bắt đầu:
     *
     * - TEST/LIVE đều không release mù trong catch.
     * - Nhánh xử lý bình thường phía trên chịu trách nhiệm
     *   release/complete.
     *
     * Điều này tránh email đã gửi nhưng product lập tức
     * trở thành eligible để gửi lại.
     */

    if (
      !sendingStarted &&
      claimToken &&
      claimedProductIds.length >
        0
    ) {
      const {
        error: cleanupError,
      } =
        await supabaseServer.rpc(
          "release_alert_claim",
          {
            p_claim_token:
              claimToken,

            p_product_ids:
              claimedProductIds,
          }
        );


      if (cleanupError) {
        console.error(
          "ALERT_CLAIM_CLEANUP_ERROR:",
          cleanupError
        );
      }
    }


   return {
  success: false,

  mode:
    sendMode,

  sendPerformed:
    sendingStarted,

  emailsSent: 0,

  message:
    sendingStarted
      ? `${errorMessage} Claim được giữ lại để tránh gửi email trùng.`
      : errorMessage,
};
    
  };
}