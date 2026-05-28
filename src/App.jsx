import { useEffect, useMemo, useState } from 'react'
import './App.css'

const emptyTotals = {
  subtotal: 0,
  savings: 0,
  platformFee: 0,
  grandTotal: 0,
}

async function apiRequest(path, options = {}, token = '') {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.message || 'Something went wrong.')
  }

  return data
}

function LandingPage({ onLogin }) {
  const [form, setForm] = useState({ name: '', phone: '' })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const login = async (event) => {
    event.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      onLogin(data)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="landing-page">
      <nav className="landing-nav">
        <div>
          <span className="brand-mark">SC</span>
          <span className="brand-name">SwiftCart</span>
        </div>
        <a href="#login">Login</a>
      </nav>

      <section className="landing-hero">
        <div className="landing-copy">
          <p className="eyebrow">Queue-free supermarket checkout</p>
          <h1>Shop faster with scan and pay billing.</h1>
          <p>
            Enter a store, scan products, see your live bill, pay digitally, and show a verified
            receipt at the exit gate.
          </p>
          <div className="feature-strip">
            <span>Barcode scan</span>
            <span>Live cart</span>
            <span>Digital receipt</span>
          </div>
        </div>

        <form className="login-card" id="login" onSubmit={login}>
          <div className="section-heading">
            <p>Customer login</p>
            <h2>Start shopping</h2>
          </div>

          <label htmlFor="name">Full name</label>
          <input
            id="name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Mukesh Yadav"
            required
          />

          <label htmlFor="phone">Mobile number</label>
          <input
            id="phone"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
            placeholder="9876543210"
            required
          />

          {error && <p className="scan-message error">{error}</p>}

          <button className="pay-button" disabled={isLoading}>
            {isLoading ? 'Logging in...' : 'Login and open app'}
          </button>
        </form>
      </section>
    </main>
  )
}

function ShoppingPage({ auth, onLogout }) {
  const [stores, setStores] = useState([])
  const [products, setProducts] = useState([])
  const [selectedStore, setSelectedStore] = useState('')
  const [scanCode, setScanCode] = useState('')
  const [cart, setCart] = useState({ items: [], totals: emptyTotals, paymentStatus: 'pending' })
  const [lastScan, setLastScan] = useState(null)
  const [history, setHistory] = useState([])
  const [verifiedReceipt, setVerifiedReceipt] = useState(null)

  const selectedStoreName = useMemo(() => {
    return stores.find((store) => store.id === selectedStore)?.name || 'Select store'
  }, [selectedStore, stores])

  const receiptId = cart.receipt?.id || 'Complete payment to generate receipt'

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [storeData, cartData, historyData] = await Promise.all([
          apiRequest('/api/stores'),
          apiRequest('/api/cart', {}, auth.token),
          apiRequest('/api/history', {}, auth.token),
        ])

        const firstStoreId = cartData.cart.storeId || storeData.stores[0]?.id || ''
        const productData = await apiRequest(`/api/stores/${firstStoreId}/products`)

        setStores(storeData.stores)
        setSelectedStore(firstStoreId)
        setProducts(productData.products)
        setScanCode(productData.products[0]?.barcode || '')
        setCart(cartData.cart)
        setHistory(historyData.history)
      } catch (requestError) {
        setLastScan({ type: 'error', message: requestError.message })
      }
    }

    loadInitialData()
  }, [auth.token])

  const scanProduct = async (barcode = scanCode) => {
    try {
      const data = await apiRequest(
        '/api/cart/scan',
        {
          method: 'POST',
          body: JSON.stringify({ storeId: selectedStore, barcode }),
        },
        auth.token,
      )
      setCart(data.cart)
      setVerifiedReceipt(null)
      setLastScan({ type: 'success', message: data.message })
    } catch (requestError) {
      setLastScan({ type: 'error', message: requestError.message })
    }
  }

  const updateQuantity = async (barcode, change) => {
    try {
      const data = await apiRequest(
        `/api/cart/items/${barcode}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ change }),
        },
        auth.token,
      )
      setCart(data.cart)
      setVerifiedReceipt(null)
    } catch (requestError) {
      setLastScan({ type: 'error', message: requestError.message })
    }
  }

  const payBill = async () => {
    try {
      const data = await apiRequest(
        '/api/payment',
        {
          method: 'POST',
          body: JSON.stringify({ method: 'UPI' }),
        },
        auth.token,
      )
      const historyData = await apiRequest('/api/history', {}, auth.token)
      setCart(data.cart)
      setHistory(historyData.history)
      setLastScan({ type: 'success', message: 'Payment successful. Receipt is ready for exit.' })
    } catch (requestError) {
      setLastScan({ type: 'error', message: requestError.message })
    }
  }

  const verifyReceipt = async () => {
    if (!cart.receipt?.id) {
      setLastScan({ type: 'error', message: 'Pay first to generate an exit receipt.' })
      return
    }

    try {
      const data = await apiRequest('/api/receipts/verify', {
        method: 'POST',
        body: JSON.stringify({ receiptId: cart.receipt.id }),
      })
      setVerifiedReceipt(data.receipt)
      setLastScan({ type: 'success', message: 'Exit gate verified the receipt.' })
    } catch (requestError) {
      setLastScan({ type: 'error', message: requestError.message })
    }
  }

  return (
    <main className="app-shell">
      <section className="app-header">
        <nav className="topbar">
          <div>
            <span className="brand-mark">SC</span>
            <span className="brand-name">SwiftCart</span>
          </div>
          <div className="user-actions">
            <span className="store-chip">{auth.user.name}</span>
            <button onClick={onLogout}>Logout</button>
          </div>
        </nav>

        <div className="app-title">
          <div>
            <p className="eyebrow">Customer self-checkout</p>
            <h1>Scan. Add to cart. Pay. Exit verified.</h1>
          </div>
          <div className="header-total">
            <span>Live bill</span>
            <strong>Rs.{cart.totals?.grandTotal || 0}</strong>
          </div>
        </div>
      </section>

      <section className="workflow-band">
        {['Enter store', 'Scan items', 'Pay bill', 'Exit check'].map((step, index) => (
          <div className="workflow-step" key={step}>
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </section>

      <section className="dashboard">
        <div className="panel scanner-panel">
          <div className="section-heading">
            <p>Step 1 and 2</p>
            <h2>Store and product scanner</h2>
          </div>

          <label htmlFor="store">Select store</label>
          <select
            id="store"
            value={selectedStore}
            onChange={(event) => {
              setSelectedStore(event.target.value)
              setLastScan({ type: 'success', message: 'Store selected. Scan a product to begin.' })
            }}
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{store.name}</option>
            ))}
          </select>

          <p className="store-location">{selectedStoreName}</p>

          <label htmlFor="barcode">Barcode or QR code</label>
          <div className="scan-control">
            <input
              id="barcode"
              value={scanCode}
              onChange={(event) => setScanCode(event.target.value)}
              placeholder="Enter product barcode"
            />
            <button onClick={() => scanProduct()}>Scan</button>
          </div>

          <div className="sample-grid">
            {products.map((product) => (
              <button key={product.barcode} onClick={() => scanProduct(product.barcode)}>
                <span>{product.name}</span>
                <strong>Rs.{product.price}</strong>
              </button>
            ))}
          </div>

          {lastScan && <p className={`scan-message ${lastScan.type}`}>{lastScan.message}</p>}
        </div>

        <div className="panel cart-panel">
          <div className="section-heading">
            <p>Step 3</p>
            <h2>Real-time cart and bill</h2>
          </div>

          <div className="cart-list">
            {cart.items.length === 0 ? (
              <div className="empty-cart">Scan a product to generate the bill.</div>
            ) : (
              cart.items.map((item) => (
                <article className="cart-item" key={item.barcode}>
                  <div>
                    <h3>{item.name}</h3>
                    <p>{item.aisle} | {item.offer}</p>
                  </div>
                  <div className="quantity-control">
                    <button aria-label={`Remove one ${item.name}`} onClick={() => updateQuantity(item.barcode, -1)}>
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button aria-label={`Add one ${item.name}`} onClick={() => updateQuantity(item.barcode, 1)}>
                      +
                    </button>
                  </div>
                  <strong>Rs.{item.price * item.quantity}</strong>
                </article>
              ))
            )}
          </div>

          <div className="bill-summary">
            <div><span>Subtotal</span><strong>Rs.{cart.totals?.subtotal || 0}</strong></div>
            <div><span>Discount saved</span><strong>Rs.{cart.totals?.savings || 0}</strong></div>
            <div><span>Platform fee</span><strong>Rs.{cart.totals?.platformFee || 0}</strong></div>
            <div className="total-row"><span>Total</span><strong>Rs.{cart.totals?.grandTotal || 0}</strong></div>
          </div>
        </div>

        <div className="panel payment-panel">
          <div className="section-heading">
            <p>Step 4 and 5</p>
            <h2>Payment and exit receipt</h2>
          </div>

          <div className="payment-box">
            <div className="qr-code" aria-label="UPI payment QR">
              <span />
              <span />
              <span />
            </div>
            <div>
              <p>UPI / card / wallet payment</p>
              <strong>Rs.{cart.totals?.grandTotal || 0}</strong>
            </div>
          </div>

          <button className="pay-button" onClick={payBill}>
            {cart.paymentStatus === 'paid' ? 'Payment completed' : 'Pay now'}
          </button>

          <div className={`receipt ${cart.paymentStatus}`}>
            <div>
              <span>Receipt ID</span>
              <strong>{receiptId}</strong>
            </div>
            <div>
              <span>Exit status</span>
              <strong>{cart.paymentStatus === 'paid' ? 'Ready for verification' : 'Awaiting payment'}</strong>
            </div>
          </div>

          <button className="verify-button" onClick={verifyReceipt}>Verify at exit gate</button>

          <div className="fraud-card">
            <h3>Fraud prevention</h3>
            <p>
              Staff can scan the receipt at the exit and compare item count using random checks,
              weight sensors, RFID tags, or camera-based matching.
            </p>
          </div>
        </div>
      </section>

      <section className="history-band">
        <div>
          <p>Purchase history</p>
          <h2>{history.length > 0 ? 'Latest order saved to history' : 'No paid order yet'}</h2>
        </div>
        <span>{verifiedReceipt ? `${verifiedReceipt.id} verified` : receiptId}</span>
      </section>
    </main>
  )
}

function App() {
  const [auth, setAuth] = useState(null)

  if (!auth) {
    return <LandingPage onLogin={setAuth} />
  }

  return <ShoppingPage auth={auth} onLogout={() => setAuth(null)} />
}

export default App
