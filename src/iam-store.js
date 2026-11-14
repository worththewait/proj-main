(() => {
  "use strict";

  const KEY = "baige.iam.v1";
  const ACTOR_KEY = "baige.iam.actor.v1";
  const actors = Object.freeze([
    Object.freeze({ id: "iam-admin", name: "管理员", kind: "admin" }),
    Object.freeze({ id: "iam-reviewer", name: "审核员", kind: "reviewer", userId: "u-shen" }),
    Object.freeze({ id: "iam-reviewer-2", name: "审核员 2", kind: "reviewer" }),
  ]);
  const listeners = new Set();
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const now = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const ids = (items) => [...new Set(Array.isArray(items) ? items.filter((id) => typeof id === "string" && id) : [])].sort();
  const text = (value) => typeof value === "string" ? value.trim() : "";
  const isPrivilegedMenu = (key) => ["review", "system", "iam-admin", "iam-reviewer", "role-approval"].includes(key);
  const isProtectedUser = (id) => Boolean(id) && actors.some((person) => person.userId === id);
  const reservedRoleCode = (code) => ["superadmin", "iam-admin", "iam-reviewer", "iam-reviewer-2"].includes(text(code).toLowerCase());
  const protectedRole = (role) => role.id === "1" || reservedRoleCode(role.code);
  let fallbackActor = actors[0].id;

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

  function defaults() { return { version: 1, users: seedUsers(), roles: seedRoles(), requests: [], events: [] }; }

  function read() {
    try {
      const raw = window.localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : defaults();
      if (parsed?.version !== 1 || !Array.isArray(parsed.users) || !Array.isArray(parsed.roles)) return defaults();
      parsed.requests = Array.isArray(parsed.requests) ? parsed.requests : [];
      parsed.events = Array.isArray(parsed.events) ? parsed.events : [];
      return parsed;
    } catch { return defaults(); }
  }

  function notify(value = read()) {
    for (const callback of listeners) {
      try { callback(clone(value)); } catch { /* Subscribers may already be unmounted. */ }
    }
  }

  function write(value) {
    try { window.localStorage.setItem(KEY, JSON.stringify(value)); }
    catch { throw new Error("无法保存授权数据，请检查浏览器存储后重试。"); }
    notify(value);
  }

  // All workbench mutations use this lock when supported. A decision and its grants
  // are committed with a single storage write, also in a standalone HTML preview.
  function withWriteLock(callback) {
    const locks = window.navigator?.locks;
    const actorId = actor().id;
    const run = () => {
      if (actor().id !== actorId) throw new Error("演示身份已切换，请重新操作。");
      return callback();
    };
    if (!locks?.request) return Promise.resolve().then(run);
    let entered = false;
    return locks.request(KEY, () => {
      entered = true;
      return run();
    }).catch((error) => {
      if (!entered && ["NotSupportedError", "SecurityError"].includes(error.name)) return run();
      throw error;
    });
  }

  function actor() {
    let id = fallbackActor;
    try { id = window.sessionStorage.getItem(ACTOR_KEY) || id; } catch { /* File previews may restrict session storage. */ }
    return actors.find((person) => person.id === id) || actors[0];
  }

  function setActor(id) {
    if (!actors.some((person) => person.id === id)) throw new Error("演示身份不存在。");
    fallbackActor = id;
    try { window.sessionStorage.setItem(ACTOR_KEY, id); } catch { /* Current page keeps its chosen actor. */ }
    return actor();
  }

  function requireActor(kind) {
    const person = actor();
    if (person.kind !== kind) throw new Error(kind === "admin" ? "仅管理员可以提交或变更授权。" : "仅审核员可以处理授权申请。");
    return person;
  }

  function findUser(value, id) { return value.users.find((user) => user.id === id); }
  function findRole(value, id) { return value.roles.find((role) => role.id === id); }
  function users() { return clone(read().users); }
  function roles() { return clone(read().roles); }
  function requests() { return clone(read().requests); }
  function isProtectedRole(id) {
    const role = findRole(read(), id);
    return Boolean(role && protectedRole(role));
  }

  const userName = (user) => user.nickname || user.username;
  const roleMenus = (role) => ids(role.menuPermissions);
  const expandedMenus = (keys) => ids(window.BaigeIamMenuCatalog?.expand(keys) || keys);
  const userRoles = (value, user) => ids(user.roleIds).map((id) => findRole(value, id)).filter(Boolean);
  const effectiveRoleMenus = (value, user) => ids(userRoles(value, user)
    .filter((role) => role.status === "normal").flatMap(roleMenus)).filter((key) => !isPrivilegedMenu(key));

  function effectiveMenus(userId) {
    const value = read();
    const user = findUser(value, userId);
    return user?.status === "normal" ? effectiveRoleMenus(value, user) : [];
  }

  function validateRole(value, id) {
    const role = findRole(value, id);
    if (!role) throw new Error("所选角色不存在。");
    if (protectedRole(role)) throw new Error("预设角色由系统管理，不能在此变更。");
    return role;
  }

  function userSnapshot(user) {
    return user ? [user.status, user.stateRevision || 0] : null;
  }

  function roleSnapshot(role) {
    return role ? [role.status, role.scopeRevision || 0, roleMenus(role)] : null;
  }

  function roleMembers(value, roleId) {
    return value.users.filter((user) => user.roleIds.includes(roleId)).sort((a, b) => a.id.localeCompare(b.id));
  }

  function directDependencies(value, type, items) {
    return items.map(({ userId, roleId }) => {
      const user = findUser(value, userId);
      const role = findRole(value, roleId);
      if (type === "membership") return [userSnapshot(user), roleSnapshot(role), Boolean(user?.roleIds.includes(roleId))];
      if (userId) return [userSnapshot(user)];
      return [roleSnapshot(role), ids(roleMembers(value, roleId).map(member => member.id))];
    });
  }

  function affectedUserIds(value, items) {
    return ids(items.flatMap(item => item.userId ? [item.userId] : roleMembers(value, item.roleId).map(user => user.id)));
  }

  const isRevision = revision => Number.isInteger(revision) && revision >= 0;
  const isState = value => value === "normal" || value === "disabled";
  const isUserDependency = row => Array.isArray(row) && row.length === 2 && isState(row[0]) && isRevision(row[1]);
  const isRoleDependency = row => Array.isArray(row) && row.length === 3
    && isState(row[0]) && isRevision(row[1]) && Array.isArray(row[2]) && row[2].every(key => typeof key === "string");

  function recordedDependencies(request) {
    try {
      const saved = JSON.parse(request.snapshot);
      const version = request.snapshotVersion;
      const baseline = version === 2 ? JSON.parse(saved[0]) : saved;
      if (!Array.isArray(baseline) || baseline.length !== request.items.length) return null;
      const oldAccountStates = new Map(version === 2 ? saved[1].map(([id, status]) => [id, status]) : []);
      const rows = request.items.map(({ userId }, index) => {
        const target = baseline[index];
        if (version !== 2 || request.type === "membership") return target;
        // Older disable/delete requests saved account state in the supplemental rows.
        if (userId) return [oldAccountStates.get(userId)];
        return [target[0], ids(target[1].map(([id]) => id))];
      });
      const valid = rows.every((row, index) => {
        if (!Array.isArray(row)) return false;
        if (request.type === "membership") {
          return row.length === 3 && isUserDependency(row[0]) && isRoleDependency(row[1]) && typeof row[2] === "boolean";
        }
        const item = request.items[index];
        if (item.userId) return row.length === 1 && isUserDependency(row[0]);
        return row.length === 2 && isRoleDependency(row[0]) && Array.isArray(row[1])
          && JSON.stringify(row[1]) === JSON.stringify(ids(item.affectedUserIds));
      });
      return valid ? rows : null;
    } catch { return null; }
  }

  function matchesDependencies(value, request) {
    return JSON.stringify(recordedDependencies(request)) === JSON.stringify(directDependencies(value, request.type, request.items));
  }

  function accountMenus(value, user) {
    return user?.status === "normal" ? expandedMenus(["home", ...effectiveRoleMenus(value, user)]) : [];
  }

  function userIdentity(user) {
    return { id: user.id, name: userName(user), username: user.username || "", department: user.department || "" };
  }

  function changedUserIdentities(request) {
    if (!Array.isArray(request.impact)) return {};
    const value = read();
    return Object.fromEntries(request.impact.flatMap(person => {
      const user = findUser(value, person?.id);
      if (!user) return [];
      const current = userIdentity(user);
      const changed = current.name !== person.name || current.username !== person.username || current.department !== person.department;
      return changed ? [[person.id, current]] : [];
    }));
  }

  function impact(value, type, items) {
    const proposed = { users: clone(value.users), roles: clone(value.roles) };
    applyRequest(proposed, { type, items });
    return affectedUserIds(value, items).map(id => {
      const user = findUser(value, id);
      const after = findUser(proposed, id);
      return {
        ...userIdentity(user),
        status: user.status, requestedStatus: after?.status || "deleted",
        currentMenus: accountMenus(value, user), requestedMenus: accountMenus(proposed, after),
      };
    });
  }

  function invalidate(request, comment = "申请对象、角色权限或成员状态已变更，请重新提交。") {
    request.status = "invalid";
    request.reviewedAt = now();
    request.comment = comment;
  }

  function snapshotBlockReason(request) {
    if (request.status !== "pending") return "";
    if (![2, 3].includes(request.snapshotVersion)) return "旧版申请缺少完整权限快照，请撤回后重新提交。";
    const affected = ids(request.items.flatMap(item => item.userId ? [item.userId] : item.affectedUserIds || []));
    const complete = recordedDependencies(request) && Array.isArray(request.impact) && request.impact.length === affected.length
      && affected.every(id => request.impact.some(person => person?.id === id
        && Array.isArray(person.currentMenus) && Array.isArray(person.requestedMenus)));
    return complete ? "" : "申请缺少完整权限快照，请撤回后重新提交。";
  }

  const roleChangeTypes = new Set(["menus", "enable-role", "disable-role", "delete-role"]);

  function findPendingRoleChange(value, roleIds) {
    if (!roleIds.size) return null;
    return value.requests.find(request => request.status === "pending" && roleChangeTypes.has(request.type)
      && request.items.some(item => roleIds.has(item.roleId))
      && (snapshotBlockReason(request) || matchesDependencies(value, request))) || null;
  }

  function pendingRoleChange(roleId) {
    return clone(findPendingRoleChange(read(), new Set([roleId])));
  }

  function blockingRoleChangeFor(value, request) {
    if (request.status !== "pending" || request.type !== "membership") return null;
    const addedRoleIds = new Set(request.items.filter(item => item.operation === "add").map(item => item.roleId));
    return findPendingRoleChange(value, addedRoleIds);
  }

  function blockingRoleChange(request) {
    return clone(blockingRoleChangeFor(read(), request));
  }

  function roleChangeBlockMessage(request) {
    const role = request.items[0]?.roleName;
    return `${role ? `「${role}」` : "该角色"}有待审核的角色变更，请先处理该申请。`;
  }

  function roleChangeBlockError(request) {
    const error = new Error(roleChangeBlockMessage(request));
    error.requestId = request.id;
    return error;
  }

  function approvalBlockReason(request) {
    const integrity = snapshotBlockReason(request);
    if (integrity) return integrity;
    const blocking = blockingRoleChange(request);
    return blocking ? roleChangeBlockMessage(blocking) : "";
  }

  function pendingAssignments(value, roleId) {
    return ids(value.requests.filter(request => request.status === "pending" && request.type === "membership"
      && request.items.some(item => item.roleId === roleId && item.operation === "add")).map(request => request.id));
  }

  function invalidateStale(value, directlyInvalidated = []) {
    const direct = new Set(directlyInvalidated);
    for (const request of value.requests) {
      if (request.status !== "pending") continue;
      if (direct.has(request.id)) {
        invalidate(request, "角色菜单已更新，请按最新配置重新提交分配申请。");
      } else if (!snapshotBlockReason(request) && !matchesDependencies(value, request)) invalidate(request);
    }
  }

  const pairKey = ({ userId, roleId }) => JSON.stringify([userId, roleId]);
  const requestTargets = items => items.map(item => JSON.stringify(item.userId ? ["user", item.userId] : ["role", item.roleId]));
  function checkRequestConflict(value, items) {
    const targets = new Set(requestTargets(items));
    const pending = value.requests.find(request => request.status === "pending"
      && requestTargets(request.items).some(key => targets.has(key)));
    if (!pending) return;
    const error = new Error("该对象已有待审核申请，请先处理原申请。");
    error.requestId = pending.id;
    throw error;
  }

  function recordRequest(value, type, items, { source, reason } = {}) {
    const person = requireActor("admin");
    const explanation = text(reason);
    if (!explanation) throw new Error("请填写申请理由。");
    invalidateStale(value);
    checkRequestConflict(value, items);
    const request = {
      id: uid("iam"), type, status: "pending", source: text(source) || "角色授权", reason: explanation,
      createdAt: now(), applicant: { id: person.id, name: person.name }, items,
      snapshotVersion: 3, snapshot: JSON.stringify(directDependencies(value, type, items)), impact: impact(value, type, items),
    };
    value.requests.unshift(request);
    return request;
  }

  function membershipItem(value, pair, operation, initialUserId) {
    const user = findUser(value, pair.userId);
    if (!user) throw new Error("所选用户不存在。");
    const role = validateRole(value, pair.roleId);
    const adding = operation === "add";
    if (adding && (role.status !== "normal" || (user.status !== "normal" && user.id !== initialUserId))) {
      throw new Error("请选择启用的用户和角色。");
    }
    if (user.roleIds.includes(role.id) === adding) {
      throw new Error(adding ? "用户已拥有该角色，无需再次申请。" : "用户尚未拥有要移除的角色。");
    }
    const menus = roleMenus(role).filter((key) => !isPrivilegedMenu(key));
    return {
      userId: user.id, userName: userName(user), roleId: role.id, roleName: role.name, operation,
      currentRoles: userRoles(value, user).map((item) => ({ id: item.id, name: item.name })),
      currentMenus: adding ? [] : menus, requestedMenus: adding ? menus : [],
    };
  }

  function membershipRequest(value, { add = [], remove = [], source, reason }, initialUserId) {
    if (!add.length && !remove.length) throw new Error("请选择至少一项角色变更。");
    const blocking = findPendingRoleChange(value, new Set(add.map(item => item.roleId)));
    if (blocking) throw roleChangeBlockError(blocking);
    const items = [
      ...add.map((pair) => membershipItem(value, pair, "add", initialUserId)),
      ...remove.map((pair) => membershipItem(value, pair, "remove")),
    ];
    if (new Set(items.map(pairKey)).size !== items.length) throw new Error("同一用户角色关系不能在一张申请中重复变更。");
    return recordRequest(value, "membership", items, { source, reason });
  }

  function requestMembership(input) {
    requireActor("admin");
    const value = read();
    const request = membershipRequest(value, input);
    write(value);
    return clone(request);
  }

  function createUser(value, input) {
    const { username, nickname, department, phone, email, gender, position, remark, status } = input;
    const user = {
      id: uid("u"), createdAt: now(), roleIds: [], status: status === "disabled" ? "disabled" : "normal",
      username, nickname, department, phone, email, gender, position, remark,
    };
    value.users.unshift(user);
    return user;
  }

  function createUserWithRequest(input, roleIds = [], meta) {
    requireActor("admin");
    const selectedRoles = ids(roleIds);
    if (!selectedRoles.length) throw new Error("请至少选择一个角色。");
    const value = read();
    const user = createUser(value, input);
    const add = selectedRoles.map((roleId) => ({ userId: user.id, roleId }));
    const request = membershipRequest(value, { ...meta, add }, user.id);
    write(value);
    return clone({ user, request });
  }

  function addUser(input, roleIds, meta) { return createUserWithRequest(input, roleIds, meta).user; }

  function applyUserDetails(user, patch) {
    if (Object.hasOwn(patch, "roleIds")) throw new Error("角色变更须提交授权审批。");
    if (patch.status !== undefined && patch.status !== user.status) {
      throw new Error("用户状态变更须提交审批。");
    }
    for (const key of ["username", "nickname", "department", "phone", "email", "gender", "position", "remark"]) {
      if (Object.hasOwn(patch, key)) user[key] = patch[key];
    }
  }

  function updateUser(id, patch) {
    requireActor("admin");
    const value = read();
    const user = findUser(value, id);
    if (!user) return false;
    applyUserDetails(user, patch);
    invalidateStale(value);
    write(value);
    return true;
  }

  function saveUserEdit(id, patch, { add = [], remove = [], originalRoles, source, reason } = {}) {
    requireActor("admin");
    const value = read();
    const user = findUser(value, id);
    if (!user) throw new Error("用户已删除，请刷新列表。");
    const changed = add.length || remove.length;
    if (changed && originalRoles && JSON.stringify(ids(originalRoles)) !== JSON.stringify(ids(user.roleIds))) {
      throw new Error("用户角色已更新，请重新打开后再编辑。");
    }
    if (changed && !text(reason)) throw new Error("请填写申请原因。");
    if ([...add, ...remove].some(pair => pair.userId !== id)) throw new Error("只能编辑当前用户的角色。");
    applyUserDetails(user, patch);
    const request = changed ? membershipRequest(value, { add, remove, source, reason }) : null;
    invalidateStale(value);
    write(value);
    return clone(request);
  }

  function addRole({ name, code, order = 1, status }) {
    requireActor("admin");
    if (reservedRoleCode(code)) throw new Error("该权限字符属于系统预设角色。");
    const value = read();
    const role = {
      id: uid("role"), createdAt: now(), status: status === "disabled" ? "disabled" : "normal",
      name, code, order, menuPermissions: [], userIds: [],
    };
    value.roles.unshift(role);
    write(value);
    return clone(role);
  }

  function applyRoleDetails(role, patch) {
    if (reservedRoleCode(patch.code)) throw new Error("该权限字符属于系统预设角色。");
    for (const key of ["name", "code", "order", "remark"]) {
      if (Object.hasOwn(patch, key)) role[key] = patch[key];
    }
  }

  function updateRole(id, patch) {
    requireActor("admin");
    const value = read();
    const role = validateRole(value, id);
    if (Object.hasOwn(patch, "userIds") || Object.hasOwn(patch, "menuPermissions")) throw new Error("角色授权须通过专用审批入口办理。");
    if (patch.status !== undefined && patch.status !== role.status) {
      throw new Error("角色状态变更须提交审批。");
    }
    applyRoleDetails(role, patch);
    invalidateStale(value);
    write(value);
    return true;
  }

  function affectedByRole(value, role) {
    const members = roleMembers(value, role.id);
    return {
      affectedUserIds: members.map(user => user.id),
      affectedUsers: members.map(user => ({ id: user.id, name: userName(user), username: user.username, department: user.department, status: user.status })),
    };
  }

  function roleChange(value, role, menuPermissions, status, deleting = false) {
    const current = roleMenus(role);
    const next = menuPermissions === undefined ? current : ids(menuPermissions);
    if (JSON.stringify(next.filter(isPrivilegedMenu)) !== JSON.stringify(current.filter(isPrivilegedMenu))) {
      throw new Error("预设后台权限不能在此变更。");
    }
    const before = expandedMenus(current).filter(key => !isPrivilegedMenu(key));
    const after = expandedMenus(next).filter(key => !isPrivilegedMenu(key));
    const menusChanged = JSON.stringify(before) !== JSON.stringify(after);
    const statusChanged = status !== role.status;
    if (!deleting && !statusChanged && !menusChanged) return null;
    const operation = deleting ? "delete" : statusChanged ? (status === "normal" ? "enable" : "disable") : "menus";
    const type = operation === "menus" ? "menus" : `${operation}-role`;
    const item = {
      roleId: role.id, roleName: role.name, operation, ...affectedByRole(value, role),
      currentMenus: statusChanged || deleting ? (role.status === "normal" ? before : []) : before,
      requestedMenus: statusChanged || deleting ? (!deleting && status === "normal" ? after : []) : after,
      nextRoleMenus: menusChanged ? next : current,
      ...(menusChanged && statusChanged ? { currentConfiguredMenus: before, requestedConfiguredMenus: after } : {}),
    };
    return { type, items: [item], requiresApproval: type !== "menus" || item.affectedUserIds.length > 0 };
  }

  function roleEditStatus(role, status) {
    if (status !== undefined && status !== "normal" && status !== "disabled") throw new Error("角色状态无效。");
    return status ?? role.status;
  }

  function rolePreviewToken(value, { type, items }, invalidatedRequests, affected) {
    const [{ roleId, nextRoleMenus }] = items;
    return JSON.stringify([roleId, type, nextRoleMenus, directDependencies(value, type, items), invalidatedRequests, affected]);
  }

  function previewRoleChange(id, menuPermissions, status) {
    const value = read();
    const role = validateRole(value, id);
    const change = roleChange(value, role, menuPermissions, roleEditStatus(role, status));
    if (!change) return { changed: false, requiresApproval: false, impact: [], invalidatedRequests: [] };
    const { type, items, requiresApproval } = change;
    const invalidatedRequests = requiresApproval ? [] : pendingAssignments(value, id);
    const affected = requiresApproval ? impact(value, type, items) : [];
    return {
      ...items[0], changed: true, requiresApproval, invalidatedRequests,
      impact: affected, token: rolePreviewToken(value, change, invalidatedRequests, affected),
    };
  }

  function saveRoleEdit(id, patch, menuPermissions, meta = {}) {
    const person = requireActor("admin");
    const value = read();
    const role = validateRole(value, id);
    if (Object.hasOwn(patch, "userIds") || Object.hasOwn(patch, "menuPermissions")) throw new Error("角色授权须通过专用审批入口办理。");
    if (meta.originalMenus && JSON.stringify(ids(meta.originalMenus)) !== JSON.stringify(roleMenus(role))) {
      throw new Error("菜单权限已更新，请重新打开后再编辑。");
    }
    if (meta.originalStatus && role.status !== meta.originalStatus) {
      throw new Error("角色状态已更新，请重新打开后再编辑。");
    }
    const change = roleChange(value, role, menuPermissions, roleEditStatus(role, patch.status));
    const invalidatedRequests = change && !change.requiresApproval ? pendingAssignments(value, role.id) : [];
    if (meta.expectedImpact !== undefined) {
      const affected = change?.requiresApproval ? impact(value, change.type, change.items) : [];
      if (!change || meta.expectedImpact !== rolePreviewToken(value, change, invalidatedRequests, affected)) {
        throw new Error("涉及用户、权限或待审申请已更新，请核对最新信息后再提交。");
      }
    }
    applyRoleDetails(role, patch);
    let request = null;
    if (change?.requiresApproval) {
      change.items[0].roleName = role.name;
      request = recordRequest(value, change.type, change.items, meta);
    } else if (change) {
      invalidateStale(value);
      checkRequestConflict(value, change.items);
      const { currentMenus, requestedMenus } = change.items[0];
      applyRequest(value, change);
      value.events.push({
        id: uid("iam-event"), type: "role-menus-saved", createdAt: now(),
        actor: { id: person.id, name: person.name }, roleId: role.id,
        previousMenus: currentMenus, nextMenus: requestedMenus,
      });
    }
    invalidateStale(value, invalidatedRequests);
    write(value);
    return clone(request);
  }

  function changeRoleMenus(roleId, menuPermissions, meta) {
    return saveRoleEdit(roleId, {}, menuPermissions, meta);
  }

  function requestLifecycle(kind, id, operation, meta) {
    requireActor("admin");
    if (!["enable", "disable", "delete"].includes(operation)) throw new Error("状态变更类型无效。");
    const value = read();
    const enabling = operation === "enable";
    const deleting = operation === "delete";
    const nextStatus = enabling ? "normal" : "disabled";
    let items;
    if (kind === "user") {
      const user = findUser(value, id);
      if (!user) throw new Error("所选用户不存在。");
      if (!enabling && isProtectedUser(id)) throw new Error("预设审核员不能停用或删除。");
      if (!deleting && user.status === nextStatus) throw new Error(enabling ? "用户已启用。" : "用户已停用。");
      items = [{
        userId: id, userName: userName(user), operation,
        currentMenus: accountMenus(value, user), requestedMenus: enabling ? accountMenus(value, { ...user, status: nextStatus }) : [],
      }];
    } else if (kind === "role") {
      const role = validateRole(value, id);
      if (!deleting && role.status === nextStatus) throw new Error(enabling ? "角色已启用。" : "角色已停用。");
      items = roleChange(value, role, undefined, nextStatus, deleting).items;
    } else {
      throw new Error("状态变更对象类型无效。");
    }
    const request = recordRequest(value, `${operation}-${kind}`, items, meta);
    write(value);
    return clone(request);
  }

  const requestEnable = (kind, id, meta) => requestLifecycle(kind, id, "enable", meta);
  const removeUser = (id, meta) => requestLifecycle("user", id, "delete", meta);
  const removeRole = (id, meta) => requestLifecycle("role", id, "delete", meta);
  const toggleUser = (id, meta) => requestLifecycle("user", id, findUser(read(), id)?.status === "disabled" ? "enable" : "disable", meta);
  const toggleRole = (id, meta) => requestLifecycle("role", id, findRole(read(), id)?.status === "disabled" ? "enable" : "disable", meta);

  function applyMembership(value, { userId, roleId }, adding) {
    const user = findUser(value, userId);
    const role = findRole(value, roleId);
    user.roleIds = user.roleIds.filter((id) => id !== roleId);
    role.userIds = role.userIds.filter((id) => id !== userId);
    if (adding) {
      user.roleIds.push(roleId);
      role.userIds.push(userId);
    }
  }

  function revokeMembership(pairs, meta) {
    return requestMembership({ ...meta, add: [], remove: pairs });
  }

  function isBeneficiary(request, person) {
    if (!person.userId) return false;
    const inImpact = Array.isArray(request.impact) && request.impact.some(user => user?.id === person.userId);
    return inImpact || request.items.some(item => item.userId === person.userId || item.affectedUserIds?.includes(person.userId));
  }

  function canReviewRequest(id) {
    const person = actor();
    const request = read().requests.find((item) => item.id === id);
    return person.kind === "reviewer" && request?.status === "pending"
      && request.applicant.id !== person.id && !isBeneficiary(request, person);
  }

  function pendingRequest(value, id) {
    const request = value.requests.find((item) => item.id === id);
    if (!request) throw new Error("申请不存在。");
    if (request.status !== "pending") throw new Error("申请已处理，请刷新后查看。");
    return request;
  }

  function applyRequest(value, request) {
    for (const item of request.items) {
      if (request.type === "membership") {
        applyMembership(value, item, item.operation === "add");
      } else if (request.type === "delete-user") {
        value.users = value.users.filter(user => user.id !== item.userId);
        for (const role of value.roles) role.userIds = role.userIds.filter(id => id !== item.userId);
      } else if (request.type === "enable-user" || request.type === "disable-user") {
        const user = findUser(value, item.userId);
        user.status = request.type === "enable-user" ? "normal" : "disabled";
        user.stateRevision = (user.stateRevision || 0) + 1;
      } else if (request.type === "delete-role") {
        value.roles = value.roles.filter(role => role.id !== item.roleId);
        for (const user of value.users) user.roleIds = user.roleIds.filter(id => id !== item.roleId);
      } else {
        const role = findRole(value, item.roleId);
        const nextMenus = item.nextRoleMenus || item.restoreMenus || (request.type === "menus" ? item.requestedMenus : null);
        if (nextMenus) role.menuPermissions = nextMenus.slice();
        if (request.type === "enable-role") role.status = "normal";
        if (request.type === "disable-role") role.status = "disabled";
        role.scopeRevision = (role.scopeRevision || 0) + 1;
      }
    }
  }

  function buildReviewPreview(value, request) {
    const affected = impact(value, request.type, request.items);
    return { impact: affected, token: JSON.stringify([request.id, affected]) };
  }

  function reviewPreview(id) {
    const value = read();
    const request = value.requests.find(item => item.id === id && item.status === "pending");
    if (!request || snapshotBlockReason(request) || !matchesDependencies(value, request)) return null;
    return buildReviewPreview(value, request);
  }

  function reviewRequest(id, decision, comment, expectedToken) {
    const person = requireActor("reviewer");
    const value = read();
    const request = pendingRequest(value, id);
    if (request.applicant.id === person.id || isBeneficiary(request, person)) throw new Error("审核员不能处理本人发起或本人受益的申请。");
    if (decision !== "approved" && decision !== "rejected") throw new Error("审核结果无效。");
    const integrity = snapshotBlockReason(request);
    if (decision === "approved" && integrity) throw new Error(integrity);
    const reason = text(comment);
    if (decision === "rejected" && !reason) throw new Error("请填写驳回原因。");
    const stale = !integrity && !matchesDependencies(value, request);
    let reviewedImpact;
    if (decision === "approved" && !stale) {
      const blocking = blockingRoleChangeFor(value, request);
      if (blocking) throw roleChangeBlockError(blocking);
      const preview = buildReviewPreview(value, request);
      if (expectedToken !== undefined && expectedToken !== preview.token) {
        const error = new Error("申请影响已更新，请核对最新权限后重新审核。");
        error.code = "IAM_REVIEW_CHANGED";
        throw error;
      }
      reviewedImpact = preview.impact;
    }
    request.reviewer = { id: person.id, name: person.name };
    request.reviewedAt = now();
    request.comment = reason;
    if (stale) {
      invalidate(request);
    } else {
      request.status = decision;
      if (decision === "approved") {
        request.approvedImpact = reviewedImpact;
        applyRequest(value, request);
      }
    }
    invalidateStale(value);
    write(value);
    return clone(request);
  }

  function withdrawRequest(id) {
    const person = requireActor("admin");
    const value = read();
    const request = pendingRequest(value, id);
    if (request.applicant.id !== person.id) throw new Error("仅申请发起人可以撤回。");
    request.status = "withdrawn";
    request.reviewedAt = now();
    request.comment = "发起人撤回申请。";
    write(value);
    return clone(request);
  }

  function subscribe(callback) {
    if (typeof callback !== "function") return () => {};
    listeners.add(callback);
    return () => listeners.delete(callback);
  }

  window.addEventListener?.("storage", (event) => {
    if (event.key === KEY || event.key === ACTOR_KEY || event.key === null) notify();
  });

  window.BaigeIamStore = Object.freeze({
    KEY, ACTOR_KEY, DEPARTMENT_TREE, actors, actor, setActor, withWriteLock,
    users, roles, requests, effectiveMenus, changedUserIdentities, isProtectedRole, isProtectedUser, isPrivilegedMenu,
    addUser, createUserWithRequest, updateUser, saveUserEdit, removeUser, toggleUser, addRole, updateRole, removeRole, toggleRole,
    requestMembership, changeRoleMenus, previewRoleChange, saveRoleEdit, requestLifecycle, requestEnable, pendingRoleChange,
    canReviewRequest, approvalBlockReason, blockingRoleChange, reviewPreview, reviewRequest, withdrawRequest, revokeMembership, subscribe,
  });
})();
