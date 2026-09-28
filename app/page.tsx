import { supabase } from "@/lib/supabase";

export default async function Home() {
  const { count: usersCount, error: usersError } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true });

  const { count: productsCount, error: productsError } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true });

  const { count: catalogCount, error: catalogError } = await supabase
    .from("product_catalog")
    .select("*", { count: "exact", head: true });

  const error = usersError || productsError || catalogError;

  return (
    <main style={{ padding: "40px", fontFamily: "Arial" }}>
      <h1>HSD Manager</h1>

      {error ? (
        <>
          <h2>Supabase connection: ERROR</h2>
          <pre>{error.message}</pre>
        </>
      ) : (
        <>
          <h2>Supabase connection: OK</h2>
          <p>Users: {usersCount ?? 0}</p>
          <p>Products: {productsCount ?? 0}</p>
          <p>Product Catalog: {catalogCount ?? 0}</p>
        </>
      )}
    </main>
  );
}