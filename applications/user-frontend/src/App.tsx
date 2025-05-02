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

// --- NEW: Interface for Network Log ---
interface NetworkLog {
  log_id: number;
  log_timestamp: string; // ISO string format
  http_method: string;
  request_path: string;
  status_code: number;
  duration_ms: string; // Comes as string from DB with NUMERIC type
  source_ip: string | null;
  request_id: string;
}

interface NetworkLogsResponse {
  totalLogs: number;
  limit: number;
  offset: number;
  logs: NetworkLog[];
}
// --- End NEW Interface ---

declare global {
  interface Window {
    config?: {
      apiBaseUrl?: string;
      // We might add other config values here later
    };
  }
}

// Function to fetch data from the backend
const fetchHelloWorld = async (): Promise<HelloWorldResponse> => {
  // --- REVERTED: Use relative path again ---
  const apiUrl = `/api/hello-world`;
  // --- End REVERT ---
  console.log(`Fetching from: ${apiUrl}`);

  const response = await fetch(apiUrl);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Network response was not ok: ${response.status} ${response.statusText} - ${errorText}`
    );
  }
  return response.json();
};

// Function to fetch company config from the backend
const fetchCompanyConfig = async (): Promise<CompanyConfigResponse> => {
  const apiUrl = `/api/config`; // Changed endpoint
  // --- End MODIFICATION ---
  console.log(`Fetching company config from: ${apiUrl}`);

  const response = await fetch(apiUrl);
  if (!response.ok) {
    // Removed 404 specific handling as config should ideally always exist now
    const errorText = await response.text();
    throw new Error(
      `Network response was not ok: ${response.status} ${response.statusText} - ${errorText}`
    );
  }
  return response.json();
};

// --- NEW: Function to fetch network logs ---
const fetchNetworkLogs = async (
  limit = 20,
  offset = 0
): Promise<NetworkLogsResponse> => {
  // --- REVERTED: Use relative path again ---
  const apiUrl = `/api/logs?limit=${limit}&offset=${offset}`;
  // --- End REVERT ---
  console.log(`Fetching network logs from: ${apiUrl}`);

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
  // const [companyCodeInput, setCompanyCodeInput] = useState("");
  // const [queryCompanyCode, setQueryCompanyCode] = useState<string | null>(null);
  const [logOffset, setLogOffset] = useState(0);
  const logLimit = 20; // Show 20 logs per page

  const {
    data: helloData,
    error: helloError,
    isLoading: helloLoading,
  } = useQuery<HelloWorldResponse, Error>({
    queryKey: ["helloWorld"],
    queryFn: fetchHelloWorld,
  });

  // Query for company config - Run automatically on mount
  const {
    data: configData,
    error: configError,
    isLoading: configLoading,
    isFetching: configFetching,
  } = useQuery<CompanyConfigResponse, Error>({
    queryKey: ["companyConfig"], // Simplified key
    queryFn: fetchCompanyConfig, // Call the modified function
    // enabled: true, // Default is true, can be omitted
    retry: 3, // Retry a few times if initial fetch fails
  });

  // --- NEW: Query for network logs ---
  const {
    data: networkLogsData,
    error: networkLogsError,
    isLoading: networkLogsLoading,
    isFetching: networkLogsFetching,
    refetch: refetchNetworkLogs, // Function to manually refetch logs
  } = useQuery<NetworkLogsResponse, Error>({
    queryKey: ["networkLogs", logLimit, logOffset], // Include limit and offset in key
    queryFn: () => fetchNetworkLogs(logLimit, logOffset),
    // Optional: Refetch every 10 seconds
    // refetchInterval: 10000,
  });
  // --- End NEW Query ---

  const handlePrevLogs = () => {
    setLogOffset((prev) => Math.max(0, prev - logLimit));
  };

  const handleNextLogs = () => {
    if (networkLogsData && logOffset + logLimit < networkLogsData.totalLogs) {
      setLogOffset((prev) => prev + logLimit);
    }
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
        <h2>Company Configuration:</h2>
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

      {/* --- NEW: Network Logs Section --- */}
      <div className="card">
        <h2>Network Request Logs (Latest First)</h2>
        <div>
          <button
            onClick={() => refetchNetworkLogs()}
            disabled={networkLogsFetching}
          >
            {networkLogsFetching ? "Refreshing..." : "Refresh Logs"}
          </button>
        </div>
        {(networkLogsLoading || networkLogsFetching) && !networkLogsData && (
          <p>Loading logs...</p>
        )}
        {networkLogsError && (
          <p>Error loading logs: {networkLogsError.message}</p>
        )}
        {networkLogsData && (
          <>
            <p>
              Showing logs {logOffset + 1} -{" "}
              {Math.min(logOffset + logLimit, networkLogsData.totalLogs)} of{" "}
              {networkLogsData.totalLogs}
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
                      Timestamp
                    </th>
                    <th style={{border: "1px solid #ddd", padding: "4px"}}>
                      Method
                    </th>
                    <th style={{border: "1px solid #ddd", padding: "4px"}}>
                      Path
                    </th>
                    <th style={{border: "1px solid #ddd", padding: "4px"}}>
                      Status
                    </th>
                    <th style={{border: "1px solid #ddd", padding: "4px"}}>
                      Duration (ms)
                    </th>
                    <th style={{border: "1px solid #ddd", padding: "4px"}}>
                      Source IP
                    </th>
                    {/*<th style={{ border: '1px solid #ddd', padding: '4px' }}>Request ID</th>*/}
                  </tr>
                </thead>
                <tbody>
                  {networkLogsData.logs.map((log) => (
                    <tr key={log.log_id}>
                      <td style={{border: "1px solid #ddd", padding: "4px"}}>
                        {new Date(log.log_timestamp).toLocaleString()}
                      </td>
                      <td style={{border: "1px solid #ddd", padding: "4px"}}>
                        {log.http_method}
                      </td>
                      <td style={{border: "1px solid #ddd", padding: "4px"}}>
                        {log.request_path}
                      </td>
                      <td style={{border: "1px solid #ddd", padding: "4px"}}>
                        {log.status_code}
                      </td>
                      <td style={{border: "1px solid #ddd", padding: "4px"}}>
                        {log.duration_ms}
                      </td>
                      <td style={{border: "1px solid #ddd", padding: "4px"}}>
                        {log.source_ip || "N/A"}
                      </td>
                      {/*<td style={{ border: '1px solid #ddd', padding: '4px' }}>{log.request_id}</td>*/}
                    </tr>
                  ))}
                </tbody>
              </table>
              {networkLogsData.logs.length === 0 && (
                <p style={{textAlign: "center", padding: "10px"}}>
                  No logs found.
                </p>
              )}
            </div>
            <div>
              <button
                onClick={handlePrevLogs}
                disabled={logOffset === 0 || networkLogsFetching}
              >
                Previous
              </button>
              <button
                onClick={handleNextLogs}
                disabled={
                  !networkLogsData ||
                  logOffset + logLimit >= networkLogsData.totalLogs ||
                  networkLogsFetching
                }
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
      {/* --- End NEW Section --- */}

      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </>
  );
}

export default App;
