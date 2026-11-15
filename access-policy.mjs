export function canManageAccess(user){return user?.role==='admin'&&user.active===true}
export function canEnter(user){return Boolean(user?.active&&(user.role==='admin'||user.role==='zavuch'||user.payment_approved===true))}


export function hasPaidTuition(user){return user?.payment_approved===true&&user.payment_amount===400000}
