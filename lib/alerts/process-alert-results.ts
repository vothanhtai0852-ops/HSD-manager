import "server-only";

import type {
  AlertGroup,
} from "@/lib/alerts/build-alert-groups";

export type RecipientDeliveryResult = {
  recipientEmail: string;
  success: boolean;
};

export type ProductDeliveryDecision = {
  completedProductIds: string[];
  failedProductIds: string[];
};

export function processAlertResults(
  groups: AlertGroup[],
  deliveryResults: RecipientDeliveryResult[]
): ProductDeliveryDecision {
  const deliveryByRecipient =
    new Map<string, boolean>();

  for (
    const result of
    deliveryResults
  ) {
    deliveryByRecipient.set(
      result.recipientEmail
        .trim()
        .toLowerCase(),
      result.success
    );
  }

  const productRecipients =
    new Map<
      string,
      Set<string>
    >();

  for (
    const group of
    groups
  ) {
    const recipientEmail =
      group.recipientEmail
        .trim()
        .toLowerCase();

    for (
      const product of
      group.products
    ) {
      let recipients =
        productRecipients.get(
          product.id
        );

      if (!recipients) {
        recipients =
          new Set<string>();

        productRecipients.set(
          product.id,
          recipients
        );
      }

      recipients.add(
        recipientEmail
      );
    }
  }

  const completedProductIds:
    string[] = [];

  const failedProductIds:
    string[] = [];

  for (
    const [
      productId,
      recipients,
    ] of productRecipients
  ) {
    let allSucceeded =
      recipients.size > 0;

    for (
      const recipientEmail of
      recipients
    ) {
      const success =
        deliveryByRecipient.get(
          recipientEmail
        );

      /*
       * Recipient không có kết quả cũng được
       * xem là thất bại.
       *
       * Không được complete sản phẩm chỉ vì
       * chúng ta "không biết" email đó ra sao.
       */
      if (success !== true) {
        allSucceeded =
          false;

        break;
      }
    }

    if (allSucceeded) {
      completedProductIds.push(
        productId
      );
    } else {
      failedProductIds.push(
        productId
      );
    }
  }

  return {
    completedProductIds,
    failedProductIds,
  };
}