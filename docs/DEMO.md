# End-to-End Demo Script (Click-by-Click)

This document provides the exact click-by-click sequence to demonstrate every requirement in the assignment's Definition of Done using **User A (Admin)** and **User B (Member)**.

---

## Prerequisites & Initial State
1. All pods are running in `store` and `platform` namespaces:
   ```bash
   kubectl get pods -n store
   kubectl get pods -n platform
   ```
2. Your `/etc/hosts` includes:
   ```
   127.0.0.1  store.local dash.local mcp.local
   ```
3. Seeded Accounts:
   - **User A (Admin)**: `admin@example.com` (Password from `SEED_ADMIN_PASSWORD` or `admin_password_change_me`)
   - **User B (Member)**: `member@example.com` (Password from `SEED_MEMBER_PASSWORD` or `member_password_change_me`)

---

## Step 1: Store Checkout (COD)
1. In a web browser, open `http://store.local`.
2. Observe the store catalog displaying **"Demo Shirt"** ($19.00).
3. Click on **"Demo Shirt"**, then click **"Add to Cart"**.
4. Go to the Cart/Checkout page (`http://store.local/checkout`).
5. Fill in billing details (e.g. John Doe, 123 Main St).
6. Select **Cash on Delivery** payment method.
7. Click **"Place Order"**.
8. Verify the order confirmation screen displays an order number (e.g. Order #12).

---

## Step 2: Log into Dashboard as Admin & Chat Create Product
1. Open `http://dash.local` in your browser.
2. Sign in as **User A**:
   - Email: `admin@example.com`
   - Password: `admin_password_change_me`
3. Notice the navigation tabs: **Servers**, **Team & Keys**, **Audit Log**, **AI Chat**.
4. Go to **AI Chat**.
5. Type and send:
   > *"Create a product named Agent Hat for 42 dollars."*
6. Wait for the assistant response.
7. Observe the tool trace below the assistant reply:
   - Tool: `woo__create_product`
   - Args: `{"name": "Agent Hat", "regularPrice": 42}`
   - Status: `✓ OK`
8. In a new browser tab, open `http://store.local/?post_type=product`.
9. Confirm **"Agent Hat"** ($42.00) is now visible on the storefront!

---

## Step 3: Manual Store Order for Agent Hat
1. On `http://store.local/?post_type=product`, click **"Agent Hat"**.
2. Add it to your cart and proceed to checkout.
3. Complete the checkout with Cash on Delivery.
4. Note the new order number.

---

## Step 4: Chat "Orders Today"
1. Return to `http://dash.local` chat as Admin.
2. Type and send:
   > *"What orders came in today?"*
3. The assistant replies listing the orders placed today (including the Agent Hat and Demo Shirt orders).
4. Inspect the tool trace:
   - Tool: `woo__list_orders`
   - Args: `{"after": "2026-10-24T00:00:00Z"}`
   - Shows the exact WooCommerce order data retrieved.

---

## Step 5: External Client as Member (User B)
1. Log out from `http://dash.local` and log in as **User B**:
   - Email: `member@example.com`
   - Password: `member_password_change_me`
2. Notice the navigation tabs: **Servers**, **Team & Keys**, **AI Chat** (**Audit Log is hidden** from members).
3. On the **Team & Keys** tab, click **"+ Mint API Key"**.
4. A popup displays your key (e.g. `umk_9f8a...`) and the configuration snippet:
   ```json
   {
     "mcpServers": {
       "team": {
         "url": "http://mcp.local/mcp",
         "headers": {
           "Authorization": "Bearer umk_YOUR_MINTED_KEY"
         }
       }
     }
   }
   ```
5. In MCP Inspector or via curl, send an MCP `tools/list` request using this key:
   ```bash
   curl -s -H "Authorization: Bearer <MEMBER_KEY>" \
        -H "Content-Type: application/json" \
        -X POST http://mcp.local/mcp \
        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```
6. Confirm the tools list includes:
   - `woo__list_products`
   - `woo__list_orders`
   - `woo__get_order`
   - `notes__list_notes`
   - `notes__add_note`
   - `notes__get_note`
   - `util__current_time`
   - `util__echo`
   *(Notice `woo__create_product` and `woo__update_order_status` are excluded per Phase 7 permissions).*

---

## Step 6: Multi-Server Prompt
1. In the chat or via the external client as User B, ask:
   > *"What is the shipping policy, and what time is it?"*
2. The response accurately states:
   - Shipping policy: *"COD only, ships in 2 days"*
   - Server time: Current ISO timestamp and timezone.
3. Inspect the tool trace:
   - `notes__get_note` (or `notes__list_notes`)
   - `util__current_time`
   Both executed successfully in a single user turn across two separate upstreams.

---

## Step 7: Revoke Member's Key
1. In the Dashboard under **Team & Keys**, click **"Revoke"** next to User B's key.
2. The key status pill immediately changes to **Revoked**.
3. Re-run the curl request with that revoked key:
   ```bash
   curl -s -H "Authorization: Bearer <MEMBER_KEY>" \
        -H "Content-Type: application/json" \
        -X POST http://mcp.local/mcp \
        -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
   ```
4. Confirm HTTP status **401 Unauthorized** is returned!

---

## Step 8: Disable One Upstream Server
1. Log back in as **Admin (User A)**.
2. Navigate to the **Servers** tab.
3. On the **Utilities** (`util`) card, click **"Disable"**.
4. The status pill changes to **Disabled** (gray).
5. Query `tools/list` as Admin:
   - Tools from `util` (`util__current_time`, `util__echo`) are no longer listed.
   - Tools from `woo` and `notes` remain available.
6. Attempt to call `util__echo`:
   - Returns a clear error: *"Upstream server 'util' is currently disabled"*.
   - Woo and Notes continue to function normally.

---

## Step 9: Scale Down Upstream Pod (Simulate Outage)
1. In your terminal, simulate a failure by scaling `notes-mcp` to 0 replicas:
   ```bash
   kubectl scale deployment notes-mcp -n platform --replicas=0
   ```
2. Request `tools/list` through the gateway:
   - The gateway's 3-second timeout catches the dead upstream.
   - The list succeeds and returns all Woo tools.
3. Within ~15–20 seconds, observe the **Company Notes** card on `http://dash.local` automatically move to **Unreachable** (red) with prober error details.
4. Scale `notes-mcp` back to 1:
   ```bash
   kubectl scale deployment notes-mcp -n platform --replicas=1
   ```
5. Within 15 seconds, the background prober automatically restores status to **Connected** (green).

---

## Step 10: Inspect Audit Log
1. As Admin, click the **Audit Log** tab.
2. Observe the complete chronological log:
   - Each row displays exact timestamp, authenticated user email (`admin@example.com` or `member@example.com`), server slug, tool name, execution duration (ms), and outcome (Success or Failed with error text).
   - Confirms zero blind spots and full accountability.
