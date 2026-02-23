import confetti from "canvas-confetti";
import { Coins, LogOut, RefreshCw, Sparkles, Wallet } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toHex } from "./lib/encoding";
import {
  clearCachedCredential,
  buildAssertionPayload,
  getCachedCredential,
  registerPasskey,
} from "./lib/webauthn";

type Page = "envelope" | "result";
type ToastTone = "info" | "success" | "warning" | "error";
type Toast = {
  id: string;
  message: string;
  tone: ToastTone;
};

const SESSION_KEY = "red-packet-session";
const BALANCE_KEY = "red-packet-balance";
const ENV_RP_ID = (import.meta.env.VITE_RP_ID ?? "").trim();

const getRpId = () => {
  if (ENV_RP_ID) {
    return ENV_RP_ID;
  }
  if (typeof window !== "undefined") {
    return window.location.hostname;
  }
  return "";
};

const TOAST_STYLES: Record<ToastTone, string> = {
  info: "bg-stone-900 text-white",
  success: "bg-emerald-600 text-white",
  warning: "bg-amber-400 text-stone-900",
  error: "bg-red-600 text-white",
};

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("envelope");
  const [loading, setLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [balance, setBalance] = useState("0");
  const [isOpening, setIsOpening] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (message: string, tone: ToastTone = "info", duration = 3500) => {
      if (!message) {
        return;
      }
      const id = `${Date.now()}-${toastIdRef.current++}`;
      setToasts((prev) => [...prev, { id, message, tone }]);
      window.setTimeout(() => dismissToast(id), duration);
    },
    [dismissToast],
  );

  useEffect(() => {
    if (typeof localStorage === "undefined") {
      return;
    }
    const session = localStorage.getItem(SESSION_KEY);
    if (session === "1") {
      setLoggedIn(true);
      setCurrentPage("result");
      const cachedBalance = localStorage.getItem(BALANCE_KEY);
      if (cachedBalance) {
        setBalance(cachedBalance);
      }
      const cachedCredential = getCachedCredential();
      if (cachedCredential) {
        fetchBalance(cachedCredential)
          .then((nextBalance) => {
            setBalance(nextBalance);
            persistSession(true, nextBalance);
          })
          .catch(() => { });
      }
    }
  }, []);

  const persistSession = (isLoggedIn: boolean, nextBalance?: string) => {
    if (typeof localStorage === "undefined") {
      return;
    }
    if (isLoggedIn) {
      localStorage.setItem(SESSION_KEY, "1");
      if (nextBalance !== undefined) {
        localStorage.setItem(BALANCE_KEY, nextBalance);
      }
    } else {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(BALANCE_KEY);
    }
  };

  const fetchBalance = async (payload: {
    credentialId: Uint8Array;
    publicKeyX: Uint8Array;
    publicKeyY: Uint8Array;
    signature?: Uint8Array;
    authenticatorData?: Uint8Array;
    signedMessageHash?: Uint8Array;
  }) => {
    const response = await fetch("/api/balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: {
          x: toHex(payload.publicKeyX),
          y: toHex(payload.publicKeyY),
        },
        credentialId: toHex(payload.credentialId),
        signature: payload.signature ? toHex(payload.signature) : undefined,
        authenticatorData: payload.authenticatorData
          ? toHex(payload.authenticatorData)
          : undefined,
        signedMessageHash: payload.signedMessageHash
          ? toHex(payload.signedMessageHash)
          : undefined,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error ?? "Balance query failed.");
    }
    return String(data?.balance ?? "0");
  };

  const triggerConfetti = () => {
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    const randomInRange = (min: number, max: number) =>
      Math.random() * (max - min) + min;

    const interval: ReturnType<typeof setInterval> = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
      });
      confetti({
        ...defaults,
        particleCount,
        origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
      });
    }, 250);
  };

  const handleLogin = async (): Promise<boolean> => {
    if (!window.PublicKeyCredential) {
      const message = "This browser does not support Passkey/WebAuthn.";
      pushToast(message, "error");
      return false;
    }

    setLoading(true);
    pushToast("Signing in with passkey...", "info");

    try {
      const rpId = getRpId();
      const cachedCredential = getCachedCredential();
      if (!cachedCredential) {
        pushToast("Creating passkey...", "info");
        await registerPasskey(rpId);
        const message = "Passkey created. Tap Open again to claim.";
        pushToast(message, "success", 5000);
        return false;
      }

      const payload = await buildAssertionPayload(rpId);

      const claimResponse = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: {
            x: toHex(payload.publicKeyX),
            y: toHex(payload.publicKeyY),
          },
          credentialId: toHex(payload.credentialId),
          signature: toHex(payload.signature),
          authenticatorData: toHex(payload.authenticatorData),
          signedMessageHash: toHex(payload.signedMessageHash),
        }),
      });

      let claimNotice = "";
      if (!claimResponse.ok) {
        const claimData = await claimResponse.json();
        claimNotice =
          claimData?.error ??
          "Claim rejected (already claimed or invalid signature).";
      }

      const nextBalance = await fetchBalance(payload);
      setBalance(nextBalance);
      setLoggedIn(true);
      persistSession(true, nextBalance);

      if (claimNotice) {
        if (claimNotice.toLowerCase().includes("already claimed")) {
          pushToast("You already claimed this packet.", "warning", 5000);
        } else {
          pushToast(claimNotice, "warning", 5000);
        }
      } else {
        pushToast(`Signed in. Balance: ${nextBalance}`, "success");
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "Failed to fetch passkey assertion.") {
        clearCachedCredential();
        const notice = "Passkey not available. Tap Open to create a new one.";
        pushToast(notice, "warning", 5000);
        return false;
      }
      const notice = `Sign-in failed: ${message}`;
      pushToast(notice, "error", 5000);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = async () => {
    if (loading) {
      return;
    }
    setIsOpening(true);
    const success = await handleLogin();
    if (success) {
      setCurrentPage("result");
      triggerConfetti();
    }
    setIsOpening(false);
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setBalance("0");
    const message = "Logged out.";
    pushToast(message, "info");
    persistSession(false);
    setCurrentPage("envelope");
  };

  const handleRefreshBalance = async () => {
    if (!window.PublicKeyCredential) {
      const message = "This browser does not support Passkey/WebAuthn.";
      pushToast(message, "error");
      return;
    }
    const cachedCredential = getCachedCredential();
    if (!cachedCredential) {
      const message = "Please sign in first.";
      pushToast(message, "warning");
      return;
    }

    setRefreshing(true);
    pushToast("Refreshing balance...", "info");

    try {
      const nextBalance = await fetchBalance(cachedCredential);
      setBalance(nextBalance);
      persistSession(true, nextBalance);
      const message = `Balance updated: ${nextBalance}`;
      pushToast(message, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const notice = `Balance refresh failed: ${message}`;
      pushToast(notice, "error", 5000);
    } finally {
      setRefreshing(false);
    }
  };

  const handleWithdraw = async (recipient: string): Promise<boolean> => {
    if (!window.PublicKeyCredential) {
      const message = "This browser does not support Passkey/WebAuthn.";
      pushToast(message, "error");
      return false;
    }
    if (!loggedIn) {
      const message = "Please sign in first.";
      pushToast(message, "warning");
      return false;
    }
    if (!recipient.trim()) {
      const message = "Please enter a recipient address.";
      pushToast(message, "warning");
      return false;
    }

    setWithdrawing(true);
    pushToast("Signing with passkey...", "info");

    try {
      const rpId = getRpId();
      const cachedCredential = getCachedCredential();
      if (!cachedCredential) {
        const message = "Please open the packet once to create a passkey first.";
        pushToast(message, "warning");
        return false;
      }

      const payload = await buildAssertionPayload(rpId);

      const response = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: {
            x: toHex(payload.publicKeyX),
            y: toHex(payload.publicKeyY),
          },
          credentialId: toHex(payload.credentialId),
          signature: toHex(payload.signature),
          authenticatorData: toHex(payload.authenticatorData),
          signedMessageHash: toHex(payload.signedMessageHash),
          recipient: recipient.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Withdraw failed.");
      }

      const nextBalance = await fetchBalance(payload);
      setBalance(nextBalance);
      persistSession(true, nextBalance);
      const txHash = data?.txHash ?? "-";
      pushToast(
        `Withdrawn successfully! Tx: ${txHash} Balance: ${nextBalance}`,
        "success",
        6000,
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const notice = `Withdraw failed: ${message}`;
      pushToast(notice, "error", 5000);
      return false;
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 flex items-center justify-center p-4 font-sans overflow-hidden">
      <div className="fixed top-4 left-1/2 z-50 w-full max-w-md -translate-x-1/2 px-4 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.2 }}
              className={`mb-2 flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lg pointer-events-auto ${TOAST_STYLES[toast.tone]}`}
            >
              <span className="flex-1">{toast.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded-md px-2 py-1 text-xs font-semibold uppercase opacity-80 hover:opacity-100"
              >
                Close
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <AnimatePresence mode="wait">
        {currentPage === "envelope" ? (
          <EnvelopePage
            key="envelope"
            onOpen={handleOpen}
            isOpening={isOpening || loading}
          />
        ) : (
          <ResultPage
            key="result"
            amount={balance}
            onLogout={handleLogout}
            onRefresh={handleRefreshBalance}
            refreshing={refreshing}
            onWithdraw={handleWithdraw}
            withdrawing={withdrawing}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function EnvelopePage({
  onOpen,
  isOpening,
}: {
  onOpen: () => void;
  isOpening: boolean;
  key?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, rotate: -10 }}
      className="relative w-full max-w-sm aspect-[3/4] bg-red-600 rounded-2xl shadow-2xl border-4 border-red-700 flex flex-col items-center justify-between p-8 overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-full h-1/3 bg-red-700/30 rounded-b-[100%] transform -translate-y-1/2" />

      <div className="z-10 text-center mt-12">
        <motion.div
          animate={
            isOpening ? { scale: [1, 1.1, 1], rotate: [0, -5, 5, 0] } : {}
          }
          transition={{ duration: 0.5, repeat: isOpening ? Infinity : 0 }}
        >
          <h1 className="text-yellow-400 font-serif italic text-4xl font-bold tracking-widest mb-2">
            福
          </h1>
          <p className="text-red-100/80 text-sm uppercase tracking-[0.3em] font-medium">
            Lucky Packet
          </p>
        </motion.div>
      </div>

      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={onOpen}
        disabled={isOpening}
        className="z-20 w-24 h-24 bg-yellow-400 rounded-full shadow-[0_0_30px_rgba(250,204,21,0.4)] border-4 border-yellow-500 flex items-center justify-center group cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
      >
        <motion.div
          animate={isOpening ? { rotate: 360 } : {}}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="text-red-700 font-bold text-xl uppercase"
        >
          {isOpening ? "Wait" : "Open"}
        </motion.div>
      </motion.button>

      <div className="z-10 text-center mb-6">
        <p className="text-yellow-400/60 text-xs font-mono tracking-tighter">
          TAP TO UNLOCK YOUR FORTUNE
        </p>
      </div>

      <div className="absolute bottom-0 left-0 w-full h-12 bg-red-800/20" />
    </motion.div>
  );
}

function ResultPage({
  amount,
  onLogout,
  onRefresh,
  refreshing,
  onWithdraw,
  withdrawing,
}: {
  amount: string;
  onLogout: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  onWithdraw: (recipient: string) => Promise<boolean>;
  withdrawing: boolean;
  key?: string;
}) {
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");

  const numericAmount = Number(amount);
  const displayAmount = Number.isFinite(numericAmount)
    ? numericAmount / 10000000000000000
    : amount || "0";

  const handleConfirmWithdraw = async () => {
    const success = await onWithdraw(walletAddress);
    if (success) {
      setWalletAddress("");
      setIsWithdrawing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-md bg-white rounded-[32px] shadow-xl p-8 flex flex-col items-center text-center relative overflow-hidden"
    >
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-yellow-100 rounded-full blur-3xl opacity-50 -z-10" />

      <AnimatePresence mode="wait">
        {!isWithdrawing ? (
          <motion.div
            key="amount-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full"
          >
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mb-8"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-2xl mb-4">
                <Sparkles className="text-red-600 w-8 h-8" />
              </div>
              <h2 className="text-stone-500 text-sm font-semibold uppercase tracking-widest">
                Congratulations!
              </h2>
            </motion.div>

            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 12, delay: 0.4 }}
              className="mb-8"
            >
              <div className="flex items-baseline justify-center gap-2">
                <span className="text-7xl font-black tracking-tighter text-stone-900">
                  {displayAmount}
                </span>
                <span className="text-2xl font-bold text-stone-400">ETH</span>
              </div>
              <p className="text-stone-400 mt-2 font-mono text-xs uppercase tracking-widest">
                Arbitrum Network
              </p>
            </motion.div>

            <div className="flex justify-center mb-8">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-stone-400 hover:text-stone-600 transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
                />
                {refreshing ? "Refreshing" : "Refresh balance"}
              </motion.button>
            </div>

            <div className="w-full space-y-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsWithdrawing(true)}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-red-200"
              >
                <Wallet className="w-5 h-5" />
                Withdraw Funds
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onLogout}
                className="w-full bg-stone-100 hover:bg-stone-200 text-stone-600 py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <LogOut className="w-5 h-5" />
                Logout
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="withdraw-form"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="w-full"
          >
            <div className="mb-8">
              <h2 className="text-stone-900 text-2xl font-bold mb-2">
                Withdraw Funds
              </h2>
              <p className="text-stone-500 text-sm">
                Enter your arbitrum wallet address below to receive your lucky
                reward.
              </p>
            </div>

            <div className="mb-8 text-left">
              <label className="block text-xs font-bold text-stone-400 uppercase tracking-widest mb-2 ml-1">
                Wallet Address
              </label>
              <input
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="e.g. 0x71C..."
                className="w-full bg-stone-50 border-2 border-stone-100 rounded-2xl px-4 py-4 focus:border-red-500 focus:outline-none transition-colors font-mono text-sm"
              />
            </div>

            <div className="w-full space-y-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleConfirmWithdraw}
                disabled={withdrawing}
                className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-red-200 disabled:opacity-50"
              >
                {withdrawing ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  >
                    <Sparkles className="w-5 h-5" />
                  </motion.div>
                ) : (
                  <Wallet className="w-5 h-5" />
                )}
                {withdrawing ? "Processing..." : "Confirm Withdrawal"}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setIsWithdrawing(false)}
                disabled={withdrawing}
                className="w-full bg-stone-100 hover:bg-stone-200 text-stone-600 py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                Back
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-6 flex items-center gap-2 text-stone-300">
        <Coins className="w-4 h-4" />
        <span className="text-[10px] font-bold uppercase tracking-widest">
          Secure Arbitrum Transfer
        </span>
      </div>
    </motion.div>
  );
}
