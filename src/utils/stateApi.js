export async function fetchRemoteState(authToken) {
  if (!authToken) return null;
  const resp = await fetch("/api/state", {
    headers: {
      Authorization: `Flatmate ${authToken}`
    }
  });
  if (resp.status === 404) return null;
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({}));
    const message = detail?.error || "Failed to load remote state";
    throw new Error(message);
  }
  return resp.json();
}

export async function saveRemoteState(authToken, state) {
  if (!authToken || !state) return;
  const payload = {
    db: state.db,
    view: state.view,
    currentUserId: state.currentUserId,
    theme: state.theme,
    leftHouseIds: state.leftHouseIds || []
  };
  await fetch("/api/state", {
    method: "PUT",
    headers: {
      Authorization: `Flatmate ${authToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ state: payload })
  }).catch(() => {});
}
