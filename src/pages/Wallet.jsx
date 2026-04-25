import { useEffect, useState } from "react";
import { account } from "../lib/appwrite";
import { getWallet } from "../lib/wallet";

export default function Wallet({ back }) {
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    async function load() {
      const user = await account.get();
      const wallet = await getWallet(user.$id);
      setBalance(wallet.balance);
    }
    load();
  }, []);

  return (
    <div>
      <h2>Wallet</h2>
      <p>₦{balance}</p>
      <button onClick={back}>Back</button>
    </div>
  );
}