import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { verifySessionToken } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase-server";


export async function GET(
  request: NextRequest
) {
  try {
    // ================================================
    // AUTH
    // ================================================

    const cookieStore =
      await cookies();

    const token =
      cookieStore.get(
        "hsd_session"
      )?.value;


    if (!token) {
      return NextResponse.json(
        {
          error:
            "Chưa đăng nhập.",
        },
        {
          status: 401,
        }
      );
    }


    const session =
      await verifySessionToken(
        token
      );


    if (!session) {
      return NextResponse.json(
        {
          error:
            "Phiên đăng nhập không hợp lệ.",
        },
        {
          status: 401,
        }
      );
    }


    // ================================================
    // QUERY
    // ================================================

    const query =
      request.nextUrl.searchParams
        .get("q")
        ?.trim() || "";


    if (!query) {
      return NextResponse.json({
        items: [],
      });
    }


    /*
     * Không tìm khi mới nhập 1 ký tự.
     * Catalog rất lớn, không cần hành hạ database
     * chỉ vì người dùng vừa gõ số 8.
     */
    if (query.length < 2) {
      return NextResponse.json({
        items: [],
      });
    }


    // Chỉ nhận các ký tự hợp lý cho mã sản phẩm.

    if (
      !/^[a-zA-Z0-9._/-]+$/.test(
        query
      )
    ) {
      return NextResponse.json({
        items: [],
      });
    }


    // ================================================
    // SEARCH PRODUCT CATALOG
    // ================================================

    const {
      data,
      error,
    } = await supabaseServer
      .from("product_catalog")
      .select(
        `
          id,
          product_code,
          product_name,
          sale_price
        `
      )
      .eq(
        "active",
        true
      )
      .ilike(
  "product_code",
  `%${query}%`
)
      .order(
        "product_code",
        {
          ascending: true,
        }
      )
      .limit(10);


    if (error) {
      console.error(
        "CATALOG_SEARCH_ERROR:",
        error
      );


      return NextResponse.json(
        {
          error:
            "Không thể tìm sản phẩm.",
        },
        {
          status: 500,
        }
      );
    }


    // ================================================
    // RESPONSE
    // ================================================

    return NextResponse.json({
      items:
        data?.map(
          (item) => ({
            id:
              item.id,

            productCode:
              item.product_code,

            productName:
              item.product_name,

            salePrice:
              item.sale_price,
          })
        ) || [],
    });
  } catch (error) {
    console.error(
      "CATALOG_SEARCH_UNEXPECTED_ERROR:",
      error
    );


    return NextResponse.json(
      {
        error:
          "Không thể tìm sản phẩm.",
      },
      {
        status: 500,
      }
    );
  }
}