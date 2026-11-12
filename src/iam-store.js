(() => {
  "use strict";

  const KEY = "baige.iam.v1";
  const listeners = new Set();
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const now = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const DEPARTMENT_TREE = [
    { id: "root", name: "中国船舶综合经济技术研究院", children: [
      { id: "oa-root", name: "OA根节点", children: [
        { id: "dept-rd", name: "研发部" },
        { id: "dept-news", name: "新闻部" },
        { id: "dept-tech", name: "技术部" },
        { id: "dept-sales", name: "销售部" },
        { id: "dept-after", name: "售后部" },
        { id: "dept-hr", name: "HR部" },
      ] },
      { id: "org-714", name: "714所", children: [
        { id: "dept-714", name: "714所部门" },
        { id: "dept-714-2", name: "714部门2" },
      ] },
    ] },
  ];

  function seedRoles() {
    return [
      { id: "3", name: "行业库涉密审核员", code: "review", order: 1, createdAt: "2023-12-25 21:30:41", status: "normal", menuPermissions: ["knowledge", "review"], userIds: [] },
      { id: "4", name: "百舸库涉密审核员", code: "review", order: 1, createdAt: "2023-12-25 21:30:41", status: "normal", menuPermissions: ["library", "review"], userIds: [] },
      { id: "1", name: "超级管理员", code: "superadmin", order: 1, createdAt: "2023-12-25 21:30:41", status: "normal", menuPermissions: ["home", "qa", "knowledge", "writing", "library", "intel", "analysis", "tools", "review", "system"], userIds: ["u-shen"] },
      { id: "2", name: "企业库涉密审核员", code: "review", order: 1, createdAt: "2023-12-25 21:30:41", status: "normal", menuPermissions: ["knowledge", "review"], userIds: [] },
      { id: "27220647241376", name: "行业知识库上传", code: "indkbupload", order: 1, createdAt: "2026-09-23 11:26:29", status: "normal", menuPermissions: ["knowledge"], userIds: ["u-yym", "u-licong", "u-qhup", "u-hysh", "u-lp"] },
      { id: "27248674802400", name: "123", code: "11", order: 1, createdAt: "2026-09-24 17:51:11", status: "normal", menuPermissions: [], userIds: [] },
      { id: "27644551053344", name: "演示", code: "showadmin", order: 1, createdAt: "2026-10-12 15:24:23", status: "normal", menuPermissions: ["home", "knowledge"], userIds: ["u-show"] },
      { id: "27690798629728", name: "管理员-智研通", code: "tenant-admin", order: 1, createdAt: "2026-10-14 17:35:18", status: "normal", menuPermissions: ["frontier"], userIds: [] },
      { id: "27869076387424", name: "演示测试", code: "showtest", order: 1, createdAt: "2026-10-22 19:01:55", status: "normal", menuPermissions: ["home"], userIds: [] },
      { id: "27224135432096", name: "行业知识库审核", code: "indkbaudit", order: 2, createdAt: "2026-09-23 15:13:35", status: "normal", menuPermissions: ["knowledge", "review"], userIds: [] },
    ];
  }

  function seedUsers() {
    return [
      { id: "u-claude", username: "claude_pa_test", nickname: "PA测试账号", department: "新闻部", phone: "19900009999", createdAt: "2026-11-12 15:40:44", status: "normal", roleIds: [] },
      { id: "u-yym", username: "yym@zkj.com", nickname: "yym", department: "新闻部", phone: "13631558170", createdAt: "2026-09-23 10:34:23", status: "normal", roleIds: ["27220647241376"] },
      { id: "u-licong", username: "licong01@zkj.com", nickname: "licong", department: "新闻部", phone: "", createdAt: "2026-09-23 15:32:16", status: "normal", roleIds: ["27220647241376"] },
      { id: "u-qhup", username: "qhup@zkj.com", nickname: "企行上传", department: "HR部", phone: "", createdAt: "2026-09-29 11:25:30", status: "normal", roleIds: ["27220647241376"] },
      { id: "u-hysh", username: "hysh@zkj.com", nickname: "行业审核", department: "HR部", phone: "13303336566", createdAt: "2026-09-29 11:27:01", status: "normal", roleIds: ["27220647241376"] },
      { id: "u-cph", username: "cph01@cimtec.net.cn", nickname: "cph01@cimtec.net.cn", department: "HR部", phone: "19500002831", createdAt: "2026-11-03 12:34:55", status: "normal", roleIds: [] },
      { id: "u-shen", username: "shen@cimtec.net.cn", nickname: "审核", department: "新闻部", phone: "13800005544", createdAt: "2026-11-02 15:49:54", status: "normal", roleIds: ["1"] },
      { id: "u-wu", username: "wuhao03@zkj.com", nickname: "吴昊03", department: "HR部", phone: "13500007654", createdAt: "2026-11-02 14:22:07", status: "normal", roleIds: [] },
      { id: "u-lp", username: "lp@cimtec.net.cn", nickname: "lp", department: "技术部", phone: "19900001000", createdAt: "2026-10-29 17:40:09", status: "normal", roleIds: ["27220647241376"] },
      { id: "u-hou", username: "hou@cimtec.net.cn", nickname: "售后2", department: "售后部", phone: "13500008899", createdAt: "2026-10-22 19:02:36", status: "normal", roleIds: [] },
      { id: "u-shou", username: "shou@cimtec.net.cn", nickname: "售后01", department: "售后部", phone: "13500007777", createdAt: "2026-10-22 18:48:08", status: "normal", roleIds: [] },
      { id: "u-chen", username: "chenning01@zkj.com", nickname: "chenning01@zkj.com", department: "OA根节点", phone: "15000000061", createdAt: "2026-10-20 14:07:40", status: "normal", roleIds: [] },
      { id: "u-bin", username: "bin.ma04@zkj.com", nickname: "马斌", department: "技术部", phone: "13600006666", createdAt: "2026-10-13 17:03:58", status: "normal", roleIds: [] },
      { id: "u-show", username: "show@cimtec.net.cn", nickname: "演示专用", department: "HR部", phone: "13800008888", createdAt: "2026-10-12 15:22:56", status: "normal", roleIds: ["27644551053344"] },
    ];
  }

  function defaults() { return { version: 1, users: seedUsers(), roles: seedRoles() }; }
  function read() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) { const value = defaults(); write(value); return value; }
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.users) || !Array.isArray(parsed.roles)) return defaults();
      return parsed;
    } catch { return defaults(); }
  }
  function write(value) {
    try { window.localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* file:// */ }
    listeners.forEach((callback) => { try { callback(clone(value)); } catch { /* noop */ } });
  }
  function users() { return clone(read().users); }
  function roles() { return clone(read().roles); }
  function addUser(input) {
    const value = read();
    const user = { id: uid("u"), createdAt: now(), status: "normal", roleIds: [], ...input };
    value.users.unshift(user);
    write(value);
    return clone(user);
  }
  function updateUser(id, patch) {
    const value = read();
    const user = value.users.find((item) => item.id === id);
    if (!user) return false;
    Object.assign(user, patch);
    write(value);
    return true;
  }
  function removeUser(id) {
    const value = read();
    value.users = value.users.filter((item) => item.id !== id);
    value.roles.forEach((role) => { role.userIds = (role.userIds || []).filter((userId) => userId !== id); });
    write(value);
  }
  function toggleUser(id) {
    const value = read();
    const user = value.users.find((item) => item.id === id);
    if (!user) return;
    user.status = user.status === "normal" ? "disabled" : "normal";
    write(value);
  }
  function assignRoles(userId, roleIds) {
    const value = read();
    const user = value.users.find((item) => item.id === userId);
    if (!user) return;
    user.roleIds = roleIds;
    value.roles.forEach((role) => {
      role.userIds = (role.userIds || []).filter((id) => id !== userId);
      if (roleIds.includes(role.id)) role.userIds.push(userId);
    });
    write(value);
  }
  function addRole(input) {
    const value = read();
    const role = { id: uid("role"), createdAt: now(), status: "normal", menuPermissions: [], userIds: [], order: 1, ...input };
    value.roles.unshift(role);
    write(value);
    return clone(role);
  }
  function updateRole(id, patch) {
    const value = read();
    const role = value.roles.find((item) => item.id === id);
    if (!role) return false;
    Object.assign(role, patch);
    write(value);
    return true;
  }
  function removeRole(id) {
    const value = read();
    value.roles = value.roles.filter((item) => item.id !== id);
    value.users.forEach((user) => { user.roleIds = (user.roleIds || []).filter((roleId) => roleId !== id); });
    write(value);
  }
  function toggleRole(id) {
    const value = read();
    const role = value.roles.find((item) => item.id === id);
    if (!role) return;
    role.status = role.status === "normal" ? "disabled" : "normal";
    write(value);
  }
  function assignUsers(roleId, userIds) {
    const value = read();
    const role = value.roles.find((item) => item.id === roleId);
    if (!role) return;
    role.userIds = userIds;
    value.users.forEach((user) => {
      user.roleIds = (user.roleIds || []).filter((id) => id !== roleId);
      if (userIds.includes(user.id)) user.roleIds.push(roleId);
    });
    write(value);
  }
  function subscribe(callback) {
    if (typeof callback !== "function") return () => {};
    listeners.add(callback);
    return () => listeners.delete(callback);
  }
  function reset() { try { window.localStorage.removeItem(KEY); } catch { /* noop */ } const value = defaults(); write(value); return clone(value); }

  window.BaigeIamStore = Object.freeze({ KEY, DEPARTMENT_TREE, users, roles, addUser, updateUser, removeUser, toggleUser, assignRoles, addRole, updateRole, removeRole, toggleRole, assignUsers, subscribe, reset });
})();
