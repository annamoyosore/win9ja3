<button onClick={goHome}>Exit</button>
  </div>

  {/* 💬 CHAT BUTTON */}
  <div
    onClick={() => {
      setUnreadCount(0);
      console.log("Open chat");
    }}
    style={{
      position: "fixed",
      bottom: 20,
      right: 20,
      background: "#111",
      color: "#fff",
      padding: "12px 16px",
      borderRadius: "50px",
      cursor: "pointer",
      boxShadow: "0 0 10px #000",
      zIndex: 2000
    }}
  >
    💬
    {unreadCount > 0 && (
      <span
        style={{
          position: "absolute",
          top: -5,
          right: -5,
          background: "red",
          color: "#fff",
          borderRadius: "50%",
          padding: "4px 6px",
          fontSize: 10,
          fontWeight: "bold"
        }}
      >
        {unreadCount}
      </span>
    )}
  </div>

</div>