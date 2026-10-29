import crypto from "crypto"
import axios from "axios"
import fs from "fs"
import dotenv from "dotenv"

dotenv.config()

// futures Test Network URL (not Spot)
const BASE = "https://testnet.binance.vision"  // Changed from BINANCE_TEST_URL
const DB = "./database/users.json"

function sign(query, secret) {
    return crypto
        .createHmac("sha256", secret)
        .update(query)
        .digest("hex")
}

// Get Spot Account Balance
async function getSpotBalance(user) {
    const timestamp = Date.now()
    const query = `timestamp=${timestamp}`
    const signature = sign(query, user.secret)

    // Spot endpoint for account info
    const url = `${BASE}/api/v3/account?${query}&signature=${signature}`
    
    const res = await axios.get(url, {
        headers: {
            "X-MBX-APIKEY": user.key
        }
    })
    
    // Extract balances from account info
    return res.data.balances.filter(b => 
        parseFloat(b.free) > 0 || parseFloat(b.locked) > 0
    )
}

// Get Spot Account Trades
async function getSpotTrades(user, symbol = "BTCUSDT") {
    const timestamp = Date.now()
    const query = `symbol=${symbol}&timestamp=${timestamp}&limit=10` // Get last 10 trades
    const signature = sign(query, user.secret)

    // Spot endpoint for account trades
    const url = `${BASE}/api/v3/myTrades?${query}&signature=${signature}`
    
    const res = await axios.get(url, {
        headers: {
            "X-MBX-APIKEY": user.key
        }
    })
    
    return res.data
}

// Get current price for a symbol
async function getSymbolPrice(symbol = "BTCUSDT") {
    const url = `${BASE}/api/v3/ticker/price?symbol=${symbol}`
    const res = await axios.get(url)
    return res.data
}

async function monitorAccounts() {
    // Test with single account first
    const user = {
        key: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_API_SECRET
    }

    console.log("🔍 Checking Binance Spot Test Network...\n")

    try {
        // 1. Get Balances
        console.log("💰 BALANCES:")
        console.log("========================")
        const balances = await getSpotBalance(user)
        
        if (balances.length === 0) {
            console.log("No balances found")
        } else {
            balances.forEach(b => {
                console.log(`${b.asset}: Free: ${b.free} | Locked: ${b.locked}`)
            })
        }

        // 2. Get Current Price
        console.log("\n📊 CURRENT PRICE:")
        console.log("========================")
        const price = await getSymbolPrice("BTCUSDT")
        console.log(`BTCUSDT: $${price.price}`)

        // 3. Get Recent Trades
        console.log("\n📝 RECENT TRADES:")
        console.log("========================")
        const trades = await getSpotTrades(user, "BTCUSDT")
        
        if (trades.length === 0) {
            console.log("No trades found")
        } else {
            trades.slice(-5).forEach((t, i) => {
                console.log(`\nTrade #${i + 1}:`)
                console.log(`  Symbol: ${t.symbol}`)
                console.log(`  Side: ${t.isBuyer ? 'BUY' : 'SELL'}`)
                console.log(`  Price: ${t.price}`)
                console.log(`  Quantity: ${t.qty}`)
                console.log(`  Quote Quantity: ${t.quoteQty}`)
                console.log(`  Commission: ${t.commission} ${t.commissionAsset}`)
                console.log(`  Time: ${new Date(t.time).toLocaleString()}`)
            })
        }

        // 4. Summary
        console.log("\n📈 SUMMARY:")
        console.log("========================")
        
        // Calculate total USDT balance (simplified - would need to convert other assets)
        const usdtBalance = balances.find(b => b.asset === 'USDT')
        if (usdtBalance) {
            console.log(`Total USDT: ${parseFloat(usdtBalance.free) + parseFloat(usdtBalance.locked)} USDT`)
            console.log(`Available USDT: ${usdtBalance.free} USDT`)
        }

    } catch (error) {
        console.error("❌ Error:", error.response?.data || error.message)
        if (error.response?.data) {
            console.error("API Error Details:", error.response.data)
        }
    }
}

// Run the monitor
monitorAccounts()