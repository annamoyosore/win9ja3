import { useEffect, useState } from "react";
import {
  account,
  databases,
  DATABASE_ID,
  WALLET_COLLECTION,
  DEPOSIT_COLLECTION,
  APP_SETTINGS_COLLECTION,
  ID,
  Query,
} from "../lib/appwrite";

const COIN_PACKAGES = [
  { coins: 500, price: 750, currency: "NGN" },
  { coins: 1000, price: 1500, currency: "NGN" },
  { coins: 2500, price: 3750, currency: "NGN" },
  { coins: 5000, price: 7500, currency: "NGN" },
];

const INTERNATIONAL_PACKAGES = [
  { coins: 1000, price: 1, currency: "USD" },
  { coins: 2500, price: 2.5, currency: "USD" },
  { coins: 5000, price: 5, currency: "USD" },
  { coins: 10000, price: 10, currency: "USD" },
];

export default function CoinsStore() {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [trxAddress, setTrxAddress] = useState("");
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("TRX");
  const [transactionReference, setTransactionReference] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notification, setNotification] = useState({
    message: "",
    type: "",
  });

  const [country, setCountry] = useState(
    localStorage.getItem("win9ja_country") || "NG"
  );

  const packages =
    country === "NG"
      ? COIN_PACKAGES
      : INTERNATIONAL_PACKAGES;

  const currency = country === "NG" ? "NG