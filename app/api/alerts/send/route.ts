import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { supabaseServer } from "@/lib/supabase-server";
import { verifySessionToken } from "@/lib/session";
import { buildAlertGroups } from "@/lib/alerts/build-alert-groups";

type UserRole =
  | "ADMIN"
  | "MANAGER"
  | "USER";

type CurrentUser = {
  id: string;
  username: string;
  role: UserRole;
  active: boolean;
};

async function getCurrentUser(): Promise<
  | {
      user: CurrentUser;
      error: null;
    }
  | {
      user: null;
      error: NextResponse;
    }
> {
  const cookieStore =
    await cookies();

  const token =
    cookieStore.get(
      "hsd_session"
    )?.value;

  if (!token) {
    return {
      user: null,
      error: NextResponse.json(
        {
          error:
            "Chưa đăng nhập.",
        },
        {
          status: 401,
        }
      ),
    };
  }

  const session =
    await verifySessionToken(
      token
    );

  if (!session) {
    return {
      user: null,
      error: NextResponse.json(
        {
          error:
            "Phiên đăng nhập không hợp lệ.",
        },
        {
          status: 401,
        }
      ),
    };
  }

  const {
    data,
    error,
  } = await supabaseServer
    .from("users")
    .select(`
      id,
      username,
      role,
      active
    `)
    .eq(
      "id",
      session.userId
    )
    .maybeSingle();

  if (error) {
    console.error(
      "ALERT_SEND_USER_ERROR:",
      error
    );

    return {
      user: null,
      error: NextResponse.json(
        {
          error:
            "Không thể kiểm tra tài khoản.",
        },
        {
          status: 500,
        }
      ),
    };
  }

  if (
    !data ||
    !data.active
  ) {
    return {
      user: null,
      error: NextResponse.json(
        {
          error:
            "Tài khoản không hợp lệ.",
        },
        {
          status: 401,
        }
      ),
    };
  }

  return {
    user:
      data as CurrentUser,
    error: null,
  };
}

export async function POST() {
  let claimToken:
    string | null = null;

  try {
    const auth =
      await getCurrentUser();

    if (auth.error) {
      return auth.error;
    }

    if (
      auth.user.role !==
      "ADMIN"
    ) {
      return NextResponse.json(
        {
          error:
            "Chỉ ADMIN mới có quyền gửi cảnh báo toàn hệ thống.",
        },
        {
          status: 403,
        }
      );
    }

    const result =
      await buildAlertGroups();

    const candidateProductIds = [
      ...new Set(
        result.groups.flatMap(
          (group) =>
            group.products.map(
              (product) =>
                product.id
            )
        )
      ),
    ];

    if (
      candidateProductIds.length ===
      0
    ) {
      return NextResponse.json({
        success: true,

        validationOnly: true,

        claimPerformed: false,
        releasePerformed: false,
        writesPerformed: false,
        emailsSent: 0,

        today:
          result.today,

        summary:
          result.summary,

        candidateProductCount: 0,
        claimedProductCount: 0,
        releasedProductCount: 0,
      });
    }

    claimToken =
      crypto.randomUUID();

    const {
      data: claimedRows,
      error: claimError,
    } = await supabaseServer.rpc(
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
        "ALERT_CLAIM_TEST_ERROR:",
        claimError
      );

      throw new Error(
        "Không thể claim sản phẩm cảnh báo."
      );
    }

    const claimedProductIds =
      (
        claimedRows ?? []
      ).map(
        (
          row: {
            product_id: string;
          }
        ) =>
          row.product_id
      );

    const {
      data: releasedCount,
      error: releaseError,
    } = await supabaseServer.rpc(
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
        "ALERT_RELEASE_TEST_ERROR:",
        releaseError
      );

      throw new Error(
        "Claim thành công nhưng không thể release."
      );
    }

    claimToken = null;

    return NextResponse.json({
      success: true,

      validationOnly: true,

      claimPerformed: true,
      releasePerformed: true,

      writesPerformed: true,

      emailsSent: 0,

      today:
        result.today,

      summary:
        result.summary,

      candidateProductCount:
        candidateProductIds.length,

      claimedProductCount:
        claimedProductIds.length,

      releasedProductCount:
        Number(
          releasedCount ?? 0
        ),

      claimedProductIds,
    });
  } catch (error) {
    /*
     * Nếu có lỗi sau khi claim nhưng trước khi
     * release hoàn tất, cố gắng dọn claim.
     */
    if (claimToken) {
      const {
        error: cleanupError,
      } = await supabaseServer.rpc(
        "release_alert_claim",
        {
          p_claim_token:
            claimToken,

          p_product_ids:
            null,
        }
      );

      if (cleanupError) {
        console.error(
          "ALERT_CLAIM_CLEANUP_ERROR:",
          cleanupError
        );
      }
    }

    console.error(
      "ALERT_SEND_VALIDATION_ERROR:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Có lỗi xảy ra khi kiểm tra cơ chế claim cảnh báo.",
      },
      {
        status: 500,
      }
    );
  }
}