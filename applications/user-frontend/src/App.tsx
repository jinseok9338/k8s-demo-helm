import {useQuery} from "@tanstack/react-query";
import "./App.css";
import {useState} from "react";

// Define the expected shape of the API response
interface HelloWorldResponse {
  message: string;
}

// Add interface for Company Config
interface CompanyConfigResponse {
  company_code: string;
  logo_url: string;
}

// Function to fetch data from the backend
const fetchHelloWorld = async (): Promise<HelloWorldResponse> => {
  // Use relative path, assuming Ingress routes /api to the backend
  const apiUrl = "/api/hello-world";
  console.log(`Fetching from: ${apiUrl}`);

  const response = await fetch(apiUrl); // Use relative path
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Network response was not ok: ${response.status} ${response.statusText} - ${errorText}`
    );
  }
  return response.json();
};

// Function to fetch company config from the backend
const fetchCompanyConfig = async (
  companyCode: string
): Promise<CompanyConfigResponse> => {
  if (!companyCode) {
    throw new Error("Company code cannot be empty");
  }
  // Use relative path, assuming Ingress routes /api to the backend
  const apiUrl = `/api/config/${companyCode}`;
  console.log(`Fetching company config from: ${apiUrl}`);

  const response = await fetch(apiUrl); // Use relative path
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `Configuration not found for company code: ${companyCode}`
      );
    }
    const errorText = await response.text();
    throw new Error(
      `Network response was not ok: ${response.status} ${response.statusText} - ${errorText}`
    );
  }
  return response.json();
};

function App() {
  // State for the input field
  const [companyCodeInput, setCompanyCodeInput] = useState("");
  // State to trigger the query
  const [queryCompanyCode, setQueryCompanyCode] = useState<string | null>(null);

  const {
    data: helloData,
    error: helloError,
    isLoading: helloLoading,
  } = useQuery<HelloWorldResponse, Error>({
    queryKey: ["helloWorld"],
    queryFn: fetchHelloWorld,
  });

  // Query for company config - only run when queryCompanyCode is set
  const {
    data: configData,
    error: configError,
    isLoading: configLoading,
    isFetching: configFetching,
  } = useQuery<CompanyConfigResponse, Error>({
    queryKey: ["companyConfig", queryCompanyCode], // Include company code in key
    queryFn: () => fetchCompanyConfig(queryCompanyCode!),
    enabled: !!queryCompanyCode, // Only run the query if queryCompanyCode is not null/empty
    retry: false, // Don't retry on 404 or other errors automatically for this example
  });

  const handleFetchConfig = () => {
    setQueryCompanyCode(companyCodeInput);
  };

  return (
    <>
      <h1>Vite + React + TS + TanStack Query</h1>
      <div className="card">
        <h2>Backend API Data (Hello World):</h2>
        {helloLoading && <p>Loading...</p>}
        {helloError && <p>Error loading data: {helloError.message}</p>}
        {helloData && <p>Message: {helloData.message}</p>}
      </div>

      <div className="card">
        <h2>Fetch Company Configuration:</h2>
        <div>
          <input
            type="text"
            value={companyCodeInput}
            onChange={(e) => setCompanyCodeInput(e.target.value)}
            placeholder="Enter Company Code (e.g., acme)"
          />
          <button onClick={handleFetchConfig} disabled={!companyCodeInput}>
            Fetch Config
          </button>
        </div>

        {(configLoading || configFetching) && <p>Loading config...</p>}
        {configError && <p>Error loading config: {configError.message}</p>}
        {configData && (
          <div>
            <h3>Configuration for: {configData.company_code}</h3>
            {configData.logo_url ? (
              <img
                src={configData.logo_url}
                alt={`${configData.company_code} Logo`}
                style={{
                  maxWidth: "200px",
                  maxHeight: "100px",
                  marginTop: "10px",
                }}
              />
            ) : (
              <p>No logo URL found.</p>
            )}
          </div>
        )}
      </div>

      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;
