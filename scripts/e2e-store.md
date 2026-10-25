# WooCommerce Store E2E Verification Guide

This guide documents the exact curl commands used to verify the Store layer, add products to the cart, place Cash on Delivery (COD) orders, and verify persistence across pod restarts.

---

## 1. Storefront Health & Product Verification

Ensure `127.0.0.1 store.local` is present in `/etc/hosts` (or pass `-H "Host: store.local"` to `http://127.0.0.1/`).

```bash
# Verify WordPress storefront returns 200 OK
curl -s -I -H "Host: store.local" http://127.0.0.1/

# Verify Demo Shirt is published in the catalog
curl -s -L -H "Host: store.local" "http://127.0.0.1/?post_type=product" | grep -i "Demo Shirt"
```

Expected output:
Contains `<a href="http://store.local/product/demo-shirt/">Demo Shirt</a>` and product ID `11`.

---

## 2. Store API Cart & Cash on Delivery (COD) Checkout

WooCommerce Store API (`/wp-json/wc/store/v1`) allows programmatic customer cart and checkout without a browser.

### Step 2.1: Add Demo Shirt (ID 11) to Cart & Obtain Session Nonce
```bash
# Add item to cart and capture Nonce and Cart-Token
INIT_RES=$(curl -s -i -H "Host: store.local" -X POST "http://127.0.0.1/wp-json/wc/store/v1/cart/add-item?id=11&quantity=1")
NONCE=$(echo "$INIT_RES" | grep -i "^Nonce:" | awk '{print $2}' | tr -d '\r')
TOKEN=$(echo "$INIT_RES" | grep -i "^Cart-Token:" | awk '{print $2}' | tr -d '\r')

# Re-submit with received Nonce and Token to create cart session
CART_RES=$(curl -s -i -H "Host: store.local" \
  -H "Nonce: $NONCE" \
  -H "Cart-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "http://127.0.0.1/wp-json/wc/store/v1/cart/add-item?id=11&quantity=1")

echo "$CART_RES" | grep "HTTP/1.1 201 Created"
```

### Step 2.2: Place COD Checkout Order
```bash
CHECKOUT_RES=$(curl -s -H "Host: store.local" \
  -H "Nonce: $NONCE" \
  -H "Cart-Token: $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "http://127.0.0.1/wp-json/wc/store/v1/checkout" \
  -d '{
    "billing_address": {
      "first_name": "John",
      "last_name": "Doe",
      "address_1": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "postcode": "94101",
      "country": "US",
      "email": "john@example.com",
      "phone": "555-1234"
    },
    "payment_method": "cod"
  }')

echo "$CHECKOUT_RES"
```

Expected output:
```json
{
  "order_id": 12,
  "status": "processing",
  "order_number": "12",
  "payment_method": "cod"
}
```

---

## 3. Verify Order in WooCommerce REST API

Using the consumer key and consumer secret configured in `deploy/secrets.local.yaml`:

```bash
curl -s -u ck_dev_change_me:cs_dev_change_me -H "Host: store.local" "http://127.0.0.1/wp-json/wc/v3/orders/12"
```

Expected output:
Contains `"status": "processing"`, `"total": "19.00"`, `"payment_method": "cod"`, and line item `"Demo Shirt"`.

---

## 4. Test Volume Persistence Across Pod Deletion

```bash
# Delete the running WordPress pod
kubectl delete pod -n store -l app=wordpress

# Wait for replica replacement to become ready
kubectl wait --namespace store --for=condition=ready pod --selector=app=wordpress --timeout=60s

# Confirm Demo Shirt and Order #12 remain intact
curl -s -L -H "Host: store.local" "http://127.0.0.1/?post_type=product" | grep -i "Demo Shirt"
curl -s -u ck_dev_change_me:cs_dev_change_me -H "Host: store.local" "http://127.0.0.1/wp-json/wc/v3/orders/12"
```
