const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const COMMISSION_RATE = 0.05;

app.get('/', (req, res) => res.json({ status: 'DroneMarket API funcionando' }));

// Crear sesión de pago
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { listingId, listingTitle, price, sellerStripeAccountId, successUrl, cancelUrl } = req.body;

    const amountCents = Math.round(price * 100);
    const platformFee = Math.round(amountCents * COMMISSION_RATE);

    const sessionParams = {
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: listingTitle,
            description: 'Compra segura a través de DroneMarket',
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { listing_id: listingId },
    };

    // Si el vendedor tiene cuenta Stripe Connect, transferir automáticamente
    if (sellerStripeAccountId) {
      sessionParams.payment_intent_data = {
        application_fee_amount: platformFee,
        transfer_data: { destination: sellerStripeAccountId },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear cuenta Stripe Connect para vendedor
app.post('/create-connect-account', async (req, res) => {
  try {
    const { userId, email, returnUrl } = req.body;

    const account = await stripe.accounts.create({
      type: 'express',
      country: 'ES',
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: 'individual',
      metadata: { user_id: userId },
    });

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: returnUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    res.json({ accountId: account.id, url: accountLink.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener estado de cuenta Connect
app.get('/connect-account-status/:accountId', async (req, res) => {
  try {
    const account = await stripe.accounts.retrieve(req.params.accountId);
    res.json({
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API corriendo en puerto ${PORT}`));
