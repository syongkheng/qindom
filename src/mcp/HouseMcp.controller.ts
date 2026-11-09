import { Router, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { RequestWithUserInfo } from "../models/requests/RequestWithUserInfo.js";
import { buildHouseMcpServer } from "./HouseMcp.server.js";

// Public, stateless Streamable HTTP MCP endpoint (JSON responses, no sessions, no auth, no database): every POST
// builds a fresh server whose tools only compute on the layout JSON they are given.
export default function createHouseMcpController() {
  const router = Router();

  router.post("/", async (req: RequestWithUserInfo, res: Response) => {
    const server = buildHouseMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
      }
    }
  });

  // No server-initiated streams or sessions to resume.
  const notAllowed = (_req: RequestWithUserInfo, res: Response) => {
    res.status(405).set("Allow", "POST").json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
  };
  router.get("/", notAllowed);
  router.delete("/", notAllowed);

  return router;
}
