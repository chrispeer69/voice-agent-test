# Add a GHL AI agent to the Social Planner

The Social Planner lists **published Managed Agents** from the configured GHL subaccount. An agent's GHL knowledge base and instructions supply facts and writing guidance; the planner's own controls choose accounts, review drafts, and schedule posts.

## Create and select an agent

1. Open [AI Agent Studio for this subaccount](https://app.gohighlevel.com/v2/location/o3Za6RJnsGJSqkXrWgVc/ai-agents/agent-studio).
2. Create a **Managed Agent** for the business. Add its instructions and attach the correct knowledge base. Add the business's verified facts, audience, tone, and any rules about claims or imagery. Enable the agent capabilities it needs for content creation, including image generation if posts need AI images.
3. **Publish** its production version. A saved but unpublished agent will not be returned by GHL's list API.
4. Return to the planner, click **Refresh GHL agents**, and select the new agent from the **AI agent** dropdown in One post, Multiple posts, or Settings. No new agent ID environment variable is required for agents discovered through the API.
5. In Settings, review the brand details and assign connected social accounts to the appropriate brand. Generate a draft and review its caption and image before scheduling.

The `CONVINI_AGENT_ID` and `USTOW_AGENT_ID` variables are only the existing agents' aliases. Keep them configured if those agents are in use. A new published agent is discovered by its GHL ID automatically.

## Private Integration permissions

In GHL, open **Settings → Developer → Private Integrations**, edit the Private Integration used by Railway, and grant these **subaccount** scopes. Save the integration, then update `GHL_PRIVATE_INTEGRATION_TOKEN` in the Social Planner Railway service if GHL issues a replacement token. Keep the token server side; do not place it in a `VITE_` variable.

| Scope | Planner use |
| --- | --- |
| `managed-agents.readonly` | List published agents and read their metadata for the dropdown and Settings. |
| `managed-agents.write` | Execute the selected agent to create captions and, when supported by its GHL setup, media. |
| `socialplanner/account.readonly` | List connected social profiles. |
| `socialplanner/post.readonly` | Import existing posts and show the content calendar. |
| `socialplanner/post.write` | Sync drafts and create, update, schedule, or publish posts when requested in the UI. |
| `socialplanner/comments.readonly` and `socialplanner/comments.write` | Read comments and send replies from the comment tools. |
| `socialplanner/statistics.readonly` | Load Social Planner analytics. |
| `medias.write` | Upload a user photo to GHL Media Storage. |

The planner also reads GHL users for its approver list; grant the matching **Users read** scope if that page reports an authorization error. The agent's own capabilities and attached knowledge bases are configured in Agent Studio, separately from Private Integration scopes.

## Railway settings

Configure these on the **Social Planner** service, not the frontend service:

```text
GHL_LOCATION_ID=o3Za6RJnsGJSqkXrWgVc
GHL_PRIVATE_INTEGRATION_TOKEN=<your subaccount Private Integration token>
GHL_TIMEZONE=America/New_York
```

The planner service also requires its existing `APP_ACCESS_PASSWORD` and `SESSION_SECRET`. Never commit their values. The frontend needs its planner URL configuration but no GHL token.

**Suggest an idea** and **Improve prompt with AI** use the selected GHL agent. No Anthropic key is needed for the Social Planner. The planner saves the selected agent's public GHL metadata in its existing data volume on first selection and also passes the editable content guide in Settings to the agent. GHL's published-agent metadata endpoint does not provide the full instructions or knowledge-base text; the agent can use its own attached knowledge while responding.

## Troubleshooting

- **Agent missing:** confirm it is a published Managed Agent in the configured subaccount, then click Refresh. The GHL list endpoint returns published production agents only.
- **401/403 when listing or running:** verify the token belongs to this subaccount and has the two `managed-agents` scopes above.
- **Caption works but no image:** check the agent's image capability and attached knowledge/instructions in GHL. Some agent responses may contain text without usable image media.
- **No connected profiles:** check `socialplanner/account.readonly` and verify the profiles are connected in this same GHL subaccount.

## GHL API references

- [List published Managed Agents](https://marketplace.gohighlevel.com/docs/ghl/agent-studio/list-managed-agents/index.html)
- [Get a published Managed Agent](https://marketplace.gohighlevel.com/docs/ghl/agent-studio/get-managed-agent/)
- [Execute a published Managed Agent](https://marketplace.gohighlevel.com/docs/ghl/agent-studio/execute-managed-agent/index.html)
- [GHL API scopes](https://marketplace.gohighlevel.com/docs/Authorization/Scopes/)
- [Upload File into Media Storage](https://marketplace.gohighlevel.com/docs/ghl/medias/upload-media-content/)
