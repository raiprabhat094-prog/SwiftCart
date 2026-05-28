import http from 'node:http'
import { randomUUID } from 'node:crypto'

const PORT = process.env.PORT || 5050

const stores = [
  { id: 'phoenix', name: 'SwiftMart Phoenix Mall', location: 'Ground Floor, Phoenix Mall' },
  { id: 'city-center', name: 'SwiftMart City Center', location: 'Level 2, City Center' },
  { id: 'fresh-basket', name: 'Fresh Basket Hypermarket', location: 'Main Atrium' },
]

const products = [
  {
    barcode: '8901030865467',
    name: 'Aashirvaad Atta 5kg',
    price: 255,
    mrp: 289,
    offer: '12% off',
    aisle: 'Aisle 3',
  },
  {
    barcode: '8901764012867',
    name: 'Dairy Milk Silk',
    price: 86,
    mrp: 95,
    offer: 'Save Rs.9',
    aisle: 'Aisle 8',
  },
  {
    barcode: '8901058005343',
    name: 'Surf Excel Liquid 1L',
    price: 209,
    mrp: 230,
    offer: 'Weekend deal',
    aisle: 'Aisle 5',
  },
  {
    barcode: '8901491101839',
    name: "Lay's Classic Salted",
    price: 48,
    mrp: 50,
    offer: 'Combo ready',
    aisle: 'Aisle 9',
  },
]

const sessions = new Map()
const carts = new Map()
const receipts = new Map()

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Content-Type': 'application/json',
  })
  response.end(JSON.stringify(payload))
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = ''

    request.on('data', (chunk) => {
      rawBody += chunk
    })

    request.on('end', () => {
      try {
        resolve(rawBody ? JSON.parse(rawBody) : {})
      } catch (error) {
        reject(error)
      }
    })
  })
}

function getToken(request) {
  const header = request.headers.authorization || ''
  return header.startsWith('Bearer ') ? header.slice(7) : null
}

function getSession(request) {
  const token = getToken(request)
  return token ? { token, user: sessions.get(token) } : { token: null, user: null }
}

function getCart(token) {
  if (!carts.has(token)) {
    carts.set(token, { storeId: stores[0].id, items: [], paymentStatus: 'pending', receipt: null })
  }

  return carts.get(token)
}

function calculateTotals(items) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const savings = items.reduce((sum, item) => sum + (item.mrp - item.price) * item.quantity, 0)
  const platformFee = items.length > 0 ? 5 : 0

  return {
    subtotal,
    savings,
    platformFee,
    grandTotal: subtotal + platformFee,
  }
}

function formatCart(cart) {
  return {
    ...cart,
    totals: calculateTotals(cart.items),
  }
}

function requireAuth(request, response) {
  const session = getSession(request)

  if (!session.user) {
    sendJson(response, 401, { message: 'Login required.' })
    return null
  }

  return session
}

async function handleRequest(request, response) {
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {})
    return
  }

  const url = new URL(request.url, `http://${request.headers.host}`)
  const pathname = url.pathname

  try {
    if (request.method === 'GET' && pathname === '/api/health') {
      sendJson(response, 200, { status: 'ok', service: 'SwiftCart API' })
      return
    }

    if (request.method === 'POST' && pathname === '/api/auth/login') {
      const { name, phone } = await readBody(request)

      if (!name || !phone) {
        sendJson(response, 400, { message: 'Name and phone are required.' })
        return
      }

      const token = randomUUID()
      const user = { id: randomUUID(), name, phone }
      sessions.set(token, user)
      carts.set(token, { storeId: stores[0].id, items: [], paymentStatus: 'pending', receipt: null })
      sendJson(response, 200, { token, user })
      return
    }

    if (request.method === 'GET' && pathname === '/api/stores') {
      sendJson(response, 200, { stores })
      return
    }

    if (request.method === 'GET' && pathname.match(/^\/api\/stores\/[^/]+\/products$/)) {
      sendJson(response, 200, { products })
      return
    }

    if (request.method === 'GET' && pathname === '/api/cart') {
      const session = requireAuth(request, response)
      if (!session) return

      sendJson(response, 200, { cart: formatCart(getCart(session.token)) })
      return
    }

    if (request.method === 'POST' && pathname === '/api/cart/scan') {
      const session = requireAuth(request, response)
      if (!session) return

      const { storeId, barcode } = await readBody(request)
      const store = stores.find((item) => item.id === storeId)
      const product = products.find((item) => item.barcode === String(barcode || '').trim())

      if (!store) {
        sendJson(response, 404, { message: 'Store not found.' })
        return
      }

      if (!product) {
        sendJson(response, 404, { message: 'Product not found in this store database.' })
        return
      }

      const cart = getCart(session.token)

      if (cart.storeId !== storeId) {
        cart.storeId = storeId
        cart.items = []
      }

      const existing = cart.items.find((item) => item.barcode === product.barcode)

      if (existing) {
        existing.quantity += 1
      } else {
        cart.items.push({ ...product, quantity: 1 })
      }

      cart.paymentStatus = 'pending'
      cart.receipt = null
      sendJson(response, 200, { message: `${product.name} added to cart.`, cart: formatCart(cart) })
      return
    }

    if (request.method === 'PATCH' && pathname.match(/^\/api\/cart\/items\/[^/]+$/)) {
      const session = requireAuth(request, response)
      if (!session) return

      const barcode = decodeURIComponent(pathname.split('/').at(-1))
      const { change } = await readBody(request)
      const cart = getCart(session.token)

      cart.items = cart.items
        .map((item) =>
          item.barcode === barcode ? { ...item, quantity: item.quantity + Number(change || 0) } : item,
        )
        .filter((item) => item.quantity > 0)
      cart.paymentStatus = 'pending'
      cart.receipt = null

      sendJson(response, 200, { cart: formatCart(cart) })
      return
    }

    if (request.method === 'POST' && pathname === '/api/payment') {
      const session = requireAuth(request, response)
      if (!session) return

      const { method = 'UPI' } = await readBody(request)
      const cart = getCart(session.token)

      if (cart.items.length === 0) {
        sendJson(response, 400, { message: 'Scan at least one product before payment.' })
        return
      }

      const receipt = {
        id: `SWC-${new Date().getFullYear()}-${String(receipts.size + 1).padStart(4, '0')}`,
        storeId: cart.storeId,
        userId: session.user.id,
        items: cart.items,
        totals: calculateTotals(cart.items),
        method,
        paidAt: new Date().toISOString(),
        exitStatus: 'Verified for exit',
      }

      receipts.set(receipt.id, receipt)
      cart.paymentStatus = 'paid'
      cart.receipt = receipt
      sendJson(response, 200, { cart: formatCart(cart), receipt })
      return
    }

    if (request.method === 'GET' && pathname === '/api/history') {
      const session = requireAuth(request, response)
      if (!session) return

      const history = [...receipts.values()].filter((receipt) => receipt.userId === session.user.id)
      sendJson(response, 200, { history })
      return
    }

    if (request.method === 'POST' && pathname === '/api/receipts/verify') {
      const { receiptId } = await readBody(request)
      const receipt = receipts.get(receiptId)

      if (!receipt) {
        sendJson(response, 404, { verified: false, message: 'Receipt not found.' })
        return
      }

      sendJson(response, 200, { verified: true, receipt })
      return
    }

    sendJson(response, 404, { message: 'Route not found.' })
  } catch (error) {
    sendJson(response, 500, { message: error.message || 'Server error.' })
  }
}

http.createServer(handleRequest).listen(PORT, () => {
  console.log(`SwiftCart API running on http://localhost:${PORT}`)
})
