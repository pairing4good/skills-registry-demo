# MCP Server — Enterprise Deployment Guide

## Why Artifactory Is the Right Foundation

JFrog Artifactory is the dominant artifact repository in large enterprises. Thousands of organizations — the majority of the Fortune 100 among them — already use Artifactory to store, version, and govern the software artifacts that run their business: container images, packages, binaries, and build outputs. It is not a niche tool; it is core infrastructure.

That reach matters for governance. Most large enterprises already have Artifactory integrated into their security controls, access management, audit logging, and compliance workflows. Procurement has approved it. Security has reviewed it. Operations knows how to run it. Extending that existing investment to cover AI skills is a far smaller lift than standing up a net-new system — and it means AI governance inherits the controls the organization has already built around software governance.

The underlying principle is the same whether the artifact is a container image or a skill bundle: versioned, owned, reviewed before deployment, and traceable after the fact. A skills registry built on Artifactory gives an organization the same answers for AI agent behavior that it already has for software: what is deployed, who approved it, and when did it change.

---

## Why You Need to Build This Yourself

JFrog Artifactory is already the artifact repository of choice in many enterprises, and JFrog has entered the MCP ecosystem — but not in the way this project needs.

As of mid-2025, JFrog's official MCP server focuses on **DevSecOps workflows**: querying artifact metadata, triggering builds, and retrieving Xray vulnerability scan results. It is designed for developers interacting with the repository through an AI assistant, not for AI agents discovering and consuming skill bundles at runtime.

There is no JFrog product that:

- Exposes a skills registry over MCP for agent consumption
- Resolves semver constraints against published skill versions
- Returns skill content in a format an agent can act on directly

That gap is exactly why the MCP server in this repo exists. It wraps Artifactory's generic artifact storage in a purpose-built protocol layer that agents can use to discover, version, and retrieve skills. Until JFrog or another vendor ships a product that fills this gap, enterprises that want governed, agent-discoverable skill registries need to operate something like this themselves.

---

## Deploying This Internally at Enterprise Scale

This demo runs entirely on `localhost`. That is appropriate for development and evaluation. For enterprise use, the MCP server must be deployed internally, behind your organization's security controls, with access to your internal Artifactory instance.

### Why internal hosting is non-negotiable

Skills often encode proprietary business logic: how your organization handles customer escalations, what format your internal reports must follow, how to query your data warehouse, what your compliance review process requires. That logic belongs inside your network.

Beyond IP protection:

- **Data residency.** Regulated industries (financial services, healthcare, government) have legal requirements about where data is processed. An externally hosted registry may not satisfy them.
- **Audit requirements.** Enterprise compliance mandates often require a complete log of what instructions agents used, when, and by whom. You can only guarantee that if you control the infrastructure.
- **Network isolation.** Agents running on internal infrastructure should not depend on external services for core capabilities. An outage at an external registry takes down every agent that depends on it.
- **Access control.** Different teams should have access to different skill sets. A general-purpose registry visible to the whole internet cannot enforce that.

### What this server currently lacks for production use

Looking at the source in `mcp-server/src/index.ts` and `mcp-server/src/artifactory.ts`, the demo server has no security controls. All of the following must be addressed before internal deployment:

| Gap | Current state | Required state |
|-----|--------------|----------------|
| Authentication | None — `/mcp` and `/health` are open to any caller | Bearer token or mTLS required on all endpoints |
| Authorization | None — any authenticated caller can list and read all skills | RBAC: read vs. publish permissions, scoped per team or namespace if needed |
| Transport encryption | Plain HTTP | TLS required; terminate at a load balancer or reverse proxy |
| Credential management | Artifactory credentials passed as env vars | Secrets manager (Vault, AWS Secrets Manager, Azure Key Vault) |
| Audit logging | None | Every `skills_get` call logged with caller identity, skill name, version, and timestamp |
| Rate limiting | None | Per-client limits to prevent registry abuse |

---

## Securing the MCP Server

### 1. Authentication with OAuth 2.0

The MCP specification defines an authorization framework built on OAuth 2.0. MCP servers acting as resource servers validate Bearer tokens issued by your enterprise identity provider.

**How it works:**

1. The MCP server registers as a resource server with your IdP (Okta, Azure Entra ID, Ping Identity, etc.).
2. Claude Code or another MCP client obtains a token from the IdP using the OAuth 2.0 authorization code flow.
3. The client includes the token in the `Authorization: Bearer <token>` header on every request to `/mcp`.
4. The MCP server validates the token (signature, expiry, issuer, audience) before processing the request.

**MCP specification reference:**
The MCP authorization spec is at [modelcontextprotocol.io/specification — Authorization](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization). It defines the required metadata discovery endpoint (`/.well-known/oauth-authorization-server`), the token validation requirements, and the scopes model.

**For the Express server in this repo**, add token validation middleware before the `/mcp` route:

```typescript
import { expressjwt } from 'express-jwt';
import { expressJwtSecret } from 'jwks-rsa';

const validateToken = expressjwt({
  secret: expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksUri: 'https://your-idp.example.com/.well-known/jwks.json',
  }),
  audience: 'https://skills-registry.internal.example.com',
  issuer: 'https://your-idp.example.com',
  algorithms: ['RS256'],
});

app.post('/mcp', validateToken, express.json(), async (req, res) => { ... });
```

Dependencies: [`express-jwt`](https://github.com/auth0/express-jwt), [`jwks-rsa`](https://github.com/auth0/node-jwks-rsa).

### 2. Authorization (RBAC)

Authentication establishes identity. Authorization determines what that identity can do.

For a skills registry, two roles cover most needs:

- **Reader** — can call `skills_list`, `skills_get`, `skills_search`. This is the role most agents and developers should have.
- **Publisher** — can upload new skills or new versions to Artifactory. This role should be restricted to CI pipelines and skill owners.

The MCP server currently exposes only read operations. Authorization enforcement for reads is straightforward: validate the token has the `skills:read` scope before processing any tool call. If you later add a publish endpoint, gate it on `skills:write`.

Extract and check scopes from the validated JWT:

```typescript
app.post('/mcp', validateToken, express.json(), async (req, res) => {
  const scopes: string[] = (req.auth as any)?.scope?.split(' ') ?? [];
  if (!scopes.includes('skills:read')) {
    return res.status(403).json({ error: 'Insufficient scope' });
  }
  // ... existing handler
});
```

For finer-grained control (team-scoped namespaces, tag-based visibility), evaluate [OPA (Open Policy Agent)](https://www.openpolicyagent.org/) as a policy engine alongside the MCP server.

### 3. Transport Encryption (TLS)

Never run the MCP server on plain HTTP in production. All traffic must be encrypted in transit.

The standard enterprise pattern is TLS termination at a reverse proxy or load balancer:

- **NGINX**: configure an upstream to the MCP server container and terminate TLS at NGINX using your internal CA certificate.
- **Envoy / Istio**: for Kubernetes deployments, a service mesh handles mTLS automatically between services.
- **AWS ALB / Azure Application Gateway / GCP Load Balancing**: if deploying to cloud-hosted internal infrastructure, terminate TLS at the managed load balancer.

The MCP server container does not need to change — it continues to listen on plain HTTP on a private port, and the proxy handles TLS externally. Configure the proxy to enforce HTTPS-only (redirect or reject plain HTTP).

**Reference:** [NGINX TLS termination guide](https://docs.nginx.com/nginx/admin-guide/security-controls/terminating-ssl-tcp/)

### 4. Network Isolation

The MCP server should not be reachable from the public internet.

- **VPN-gated access.** Require that callers are on the corporate VPN or connected via a zero-trust network access (ZTNA) solution (Cloudflare Access, Zscaler Private Access, Tailscale).
- **Private DNS.** Publish the MCP server under an internal-only domain (e.g., `skills-registry.internal.example.com`). Do not add a public DNS record.
- **Kubernetes NetworkPolicy / security groups.** If running in Kubernetes or a cloud VPC, restrict ingress to the MCP server port to only the subnets or pods that need it.

### 5. Secrets Management

In this demo, Artifactory credentials are passed as environment variables. In production, use your organization's secrets manager:

- **HashiCorp Vault** — inject secrets as environment variables at container startup using the Vault Agent or the Vault Secrets Operator for Kubernetes.
- **AWS Secrets Manager / Parameter Store** — retrieve credentials at startup using the AWS SDK; rotate on a schedule.
- **Azure Key Vault** — use Managed Identity to grant the container access without storing credentials anywhere.

Also create a dedicated Artifactory service account for the MCP server with the minimum necessary permissions (read from `skills-registry`, nothing else). Do not use the `admin` account.

### 6. Audit Logging

Every skill retrieval should produce a log entry with:

- Caller identity (from the JWT `sub` or `email` claim)
- Skill name and version
- Timestamp
- Request outcome (success / error)

Add a logging middleware to the Express app and ship logs to your SIEM (Splunk, Datadog, Elastic, etc.):

```typescript
app.post('/mcp', validateToken, express.json(), async (req, res) => {
  const caller = (req.auth as any)?.sub ?? 'unknown';
  console.log(JSON.stringify({
    event: 'mcp_request',
    caller,
    timestamp: new Date().toISOString(),
    body: req.body,
  }));
  // ... existing handler
});
```

### 7. Artifactory-Side Security

The MCP server is one layer of control. Artifactory provides another. Configure Artifactory to:

- **Require authentication.** Disable anonymous access to the `skills-registry` repository.
- **Use permission targets.** Create an Artifactory permission target that grants read access to the `skills-registry` repo only to the MCP server's service account and to developers who need direct access.
- **Enable audit logging.** Artifactory logs all artifact access natively. Forward these logs to your SIEM alongside MCP server logs.

**Reference:** [JFrog Artifactory — Access Management](https://jfrog.com/help/r/jfrog-artifactory-documentation/artifactory-access-management)

---

## Reference Architecture

```
                    Corporate Network / VPN
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   Developer / Agent                                      │
│   (Claude Code, IDE, CI pipeline)                        │
│        │                                                 │
│        │  HTTPS + Bearer token                          │
│        ▼                                                 │
│   ┌─────────────┐                                        │
│   │  Reverse    │  TLS termination, rate limiting        │
│   │  Proxy      │  (NGINX / Envoy / ALB)                 │
│   └──────┬──────┘                                        │
│          │  HTTP (private network)                       │
│          ▼                                               │
│   ┌─────────────┐                                        │
│   │  MCP Server │  Token validation, RBAC, audit log    │
│   └──────┬──────┘                                        │
│          │  HTTPS + service account token                │
│          ▼                                               │
│   ┌─────────────┐                                        │
│   │  JFrog      │  Permission targets, anonymous         │
│   │  Artifactory│  access disabled, audit logging       │
│   └─────────────┘                                        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Further Reading

| Topic | Resource |
|-------|----------|
| MCP Authorization specification | [modelcontextprotocol.io — Authorization](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization) |
| MCP security considerations | [modelcontextprotocol.io — Security](https://modelcontextprotocol.io/docs/concepts/transports) |
| OAuth 2.0 (RFC 6749) | [datatracker.ietf.org/doc/html/rfc6749](https://datatracker.ietf.org/doc/html/rfc6749) |
| JSON Web Tokens (RFC 7519) | [datatracker.ietf.org/doc/html/rfc7519](https://datatracker.ietf.org/doc/html/rfc7519) |
| OWASP API Security Top 10 | [owasp.org/www-project-api-security](https://owasp.org/www-project-api-security/) |
| JFrog Artifactory access management | [jfrog.com/help — Access Management](https://jfrog.com/help/r/jfrog-artifactory-documentation/artifactory-access-management) |
| OPA (Open Policy Agent) | [openpolicyagent.org](https://www.openpolicyagent.org/) |
| HashiCorp Vault | [vaultproject.io](https://www.vaultproject.io/) |
