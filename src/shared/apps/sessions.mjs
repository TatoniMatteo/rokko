export function workspacePartition(id) { return `persist:rokko-workspace-${id}`; }
export function sharesWorkspace(app) {
  return app.workspaceId !== null && app.partition === workspacePartition(app.workspaceId);
}
export function servicePartition(id, workspaceId, shared) {
  return shared && workspaceId !== null ? workspacePartition(workspaceId) : `persist:rokko-${id}`;
}
export function visibleApps(data) {
  return [...data.apps.filter(app => app.workspaceId === null),
    ...data.apps.filter(app => app.workspaceId === data.selectedWorkspaceId)];
}
