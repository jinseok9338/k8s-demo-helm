import {useQuery} from "@tanstack/react-query";
import "./App.css";
import {useState} from "react";

// --- NEW: Interface for User ---
interface User {
  id: number;
  email: string;
  role: string;
  company_code: string;
  created_at: string; // ISO string format
  updated_at: string; // ISO string format
}

interface UsersResponse {
  totalItems: number;
  limit: number;
  offset: number;
  users: User[];
}
// --- End NEW User Interface ---

// --- NEW: Interface for Product ---
interface Product {
  id: number;
  name: string;
  description: string | null;
  price: string; // Comes as string from DB decimal type
  company_code: string;
  created_at: string; // ISO string format
  updated_at: string; // ISO string format
}

interface ProductsResponse {
  totalItems: number;
  limit: number;
  offset: number;
  products: Product[];
}
// --- End NEW Product Interface ---

declare global {
  interface Window {
    config?: {
      apiBaseUrl?: string;
      // We might add other config values here later
    };
  }
}

// --- NEW: Function to fetch users ---
const fetchUsers = async (limit = 10, offset = 0): Promise<UsersResponse> => {
  const apiUrl = `/api/users?limit=${limit}&offset=${offset}`;
  console.log(`Fetching users from: ${apiUrl}`);

  const response = await fetch(apiUrl);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Network response was not ok: ${response.status} ${response.statusText} - ${errorText}`
    );
  }
  return response.json();
};
// --- End NEW Function ---

// --- NEW: Function to fetch products ---
const fetchProducts = async (
  limit = 10,
  offset = 0
): Promise<ProductsResponse> => {
  const apiUrl = `/api/products?limit=${limit}&offset=${offset}`;
  console.log(`Fetching products from: ${apiUrl}`);

  const response = await fetch(apiUrl);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Network response was not ok: ${response.status} ${response.statusText} - ${errorText}`
    );
  }
  return response.json();
};
// --- End NEW Function ---

function App() {
  // State for pagination
  const [userOffset, setUserOffset] = useState(0);
  const [productOffset, setProductOffset] = useState(0);
  const pageLimit = 10; // Show 10 items per page

  // --- NEW: Query for users ---
  const {
    data: usersData,
    error: usersError,
    isLoading: usersLoading,
    isFetching: usersFetching,
    refetch: refetchUsers,
  } = useQuery<UsersResponse, Error>({
    queryKey: ["users", pageLimit, userOffset], // Include limit and offset in key
    queryFn: () => fetchUsers(pageLimit, userOffset),
  });
  // --- End NEW Query ---

  // --- NEW: Query for products ---
  const {
    data: productsData,
    error: productsError,
    isLoading: productsLoading,
    isFetching: productsFetching,
    refetch: refetchProducts,
  } = useQuery<ProductsResponse, Error>({
    queryKey: ["products", pageLimit, productOffset], // Include limit and offset in key
    queryFn: () => fetchProducts(pageLimit, productOffset),
  });
  // --- End NEW Query ---

  // --- Handlers for User Pagination ---
  const handlePrevUsers = () => {
    setUserOffset((prev) => Math.max(0, prev - pageLimit));
  };

  const handleNextUsers = () => {
    if (usersData && userOffset + pageLimit < usersData.totalItems) {
      setUserOffset((prev) => prev + pageLimit);
    }
  };

  // --- Handlers for Product Pagination ---
  const handlePrevProducts = () => {
    setProductOffset((prev) => Math.max(0, prev - pageLimit));
  };

  const handleNextProducts = () => {
    if (productsData && productOffset + pageLimit < productsData.totalItems) {
      setProductOffset((prev) => prev + pageLimit);
    }
  };

  return (
    <>
      <h1>Vite + React + TS + TanStack Query</h1>

      {/* --- NEW: Users Section --- */}
      <div className="card">
        <h2>Users</h2>
        <div>
          <button onClick={() => refetchUsers()} disabled={usersFetching}>
            {usersFetching ? "Refreshing..." : "Refresh Users"}
          </button>
        </div>
        {(usersLoading || usersFetching) && !usersData && (
          <p>Loading users...</p>
        )}
        {usersError && <p>Error loading users: {usersError.message}</p>}
        {usersData && (
          <>
            <p>
              Showing users {userOffset + 1} -{" "}
              {Math.min(userOffset + pageLimit, usersData.totalItems)} of{" "}
              {usersData.totalItems}
            </p>
            <div
              style={{
                maxHeight: "300px",
                overflowY: "scroll",
                border: "1px solid #ccc",
                marginBottom: "10px",
              }}
            >
              <table style={{width: "100%", borderCollapse: "collapse"}}>
                <thead>
                  <tr>
                    <th style={{border: "1px solid #ddd", padding: "4px"}}>
                      ID
                    </th>
                    <th style={{border: "1px solid #ddd", padding: "4px"}}>
                      Email
                    </th>
                    <th style={{border: "1px solid #ddd", padding: "4px"}}>
                      Role
                    </th>
                    <th style={{border: "1px solid #ddd", padding: "4px"}}>
                      Company
                    </th>
                    <th style={{border: "1px solid #ddd", padding: "4px"}}>
                      Created At
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {usersData.users.map((user) => (
                    <tr key={user.id}>
                      <td style={{border: "1px solid #ddd", padding: "4px"}}>
                        {user.id}
                      </td>
                      <td style={{border: "1px solid #ddd", padding: "4px"}}>
                        {user.email}
                      </td>
                      <td style={{border: "1px solid #ddd", padding: "4px"}}>
                        {user.role}
                      </td>
                      <td style={{border: "1px solid #ddd", padding: "4px"}}>
                        {user.company_code}
                      </td>
                      <td style={{border: "1px solid #ddd", padding: "4px"}}>
                        {new Date(user.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {usersData.users.length === 0 && (
                <p style={{textAlign: "center", padding: "10px"}}>
                  No users found.
                </p>
              )}
            </div>
            <div>
              <button
                onClick={handlePrevUsers}
                disabled={userOffset === 0 || usersFetching}
              >
                Previous
              </button>
              <button
                onClick={handleNextUsers}
                disabled={
                  !usersData ||
                  userOffset + pageLimit >= usersData.totalItems ||
                  usersFetching
                }
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
      {/* --- End NEW Users Section --- */}

      {/* --- NEW: Products Section --- */}
      <div className="card">
        <h2>Products</h2>
        <div>
          <button onClick={() => refetchProducts()} disabled={productsFetching}>
            {productsFetching ? "Refreshing..." : "Refresh Products"}
          </button>
        </div>
        {(productsLoading || productsFetching) && !productsData && (
          <p>Loading products...</p>
        )}
        {productsError && (
          <p>Error loading products: {productsError.message}</p>
        )}
        {productsData && (
          <>
            <p>
              Showing products {productOffset + 1} -{" "}
              {Math.min(productOffset + pageLimit, productsData.totalItems)} of{" "}
              {productsData.totalItems}
            </p>
            <div
              style={{
                maxHeight: "300px",
                overflowY: "scroll",
                border: "1px solid #ccc",
                marginBottom: "10px",
              }}
            >
              <table style={{width: "100%", borderCollapse: "collapse"}}>
                <thead>
                  <tr>
                    <th style={{border: "1px solid #ddd", padding: "4px"}}>
                      ID
                    </th>
                    <th style={{border: "1px solid #ddd", padding: "4px"}}>
                      Name
                    </th>
                    <th style={{border: "1px solid #ddd", padding: "4px"}}>
                      Description
                    </th>
                    <th style={{border: "1px solid #ddd", padding: "4px"}}>
                      Price
                    </th>
                    <th style={{border: "1px solid #ddd", padding: "4px"}}>
                      Company
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {productsData.products.map((product) => (
                    <tr key={product.id}>
                      <td style={{border: "1px solid #ddd", padding: "4px"}}>
                        {product.id}
                      </td>
                      <td style={{border: "1px solid #ddd", padding: "4px"}}>
                        {product.name}
                      </td>
                      <td style={{border: "1px solid #ddd", padding: "4px"}}>
                        {product.description}
                      </td>
                      <td style={{border: "1px solid #ddd", padding: "4px"}}>
                        ${product.price}
                      </td>
                      <td style={{border: "1px solid #ddd", padding: "4px"}}>
                        {product.company_code}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {productsData.products.length === 0 && (
                <p style={{textAlign: "center", padding: "10px"}}>
                  No products found.
                </p>
              )}
            </div>
            <div>
              <button
                onClick={handlePrevProducts}
                disabled={productOffset === 0 || productsFetching}
              >
                Previous
              </button>
              <button
                onClick={handleNextProducts}
                disabled={
                  !productsData ||
                  productOffset + pageLimit >= productsData.totalItems ||
                  productsFetching
                }
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
      {/* --- End NEW Products Section --- */}

      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;
