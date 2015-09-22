const {diff, patchMetaData} = require("./reloadUtils")
const {info, warn} = require("./console")
const {isPlainObj, values} = require("../common")

export default function handleChanges(scope$$, {modules: newModules, entryId: newEntryId}) {
  const {modules, require: __require} = scope$$

  const modulesToReload = diff(modules, newModules, newEntryId)
  patchMetaData(scope$$, newModules)

  if (modulesToReload.length === 0) {
    info("Nothing to patch")
    return
  }

  const patch = modulesToReload.map(mod => ({
    id: mod.id,
    changed: mod.changed,
    file: mod.file,
    source: mod.source,
    parents: mod.parents.map(Number),
    isNew: mod.isNew
  }))

  const propagationGuards = {}
  patch.forEach(({id, changed, parents}) => {
    propagationGuards[id] = (propagationGuards[id] || 0) + (changed ? 1 : 0)
    parents.forEach(p => propagationGuards[p] = (propagationGuards[p] || 0) + 1)
  })

  info("Apply patch")
  try {
    patch.forEach(({id, file, parents, isNew}) => {
      if (propagationGuards[id] > 0) {
        if (isNew) {
          console.log(" > Add new module  ::", file)
        } else {
          console.log(" > Patch module    ::", file)
        }

        try {
          // ATTENTION: must use scope object because it has been mutated during "pathMetaData"
          // first delete previous exports from the batched module
          delete scope$$.exports[id]
          // the reload those exports
          __require.__byId(id, true)
        } catch (e) {
          console.error(e)
          warn("Abort patching")
          throw {aborted: true}
        }

        if (!isNew && isStoppable(scope$$.exports[id] || {})) {
          preventPropagation(parents)
        }
      } else {
        // this will prevent propagation to ancestor files
        preventPropagation(parents)
      }
    })
    info("Patching complete")
  } catch (e) {
    if (!e.aborted) {
      console.error(e)
    }
  }

  function preventPropagation(parents) {
    parents.forEach(p => {
      const parent = patch.find(({id}) => id === p)
      if (parent) {
        propagationGuards[parent.id]--
      }
    })
  }
}

function isStoppable({exports}) {
  if (isProxied(exports)) {
    return true
  } else if (isPlainObj(exports)) {
    return !!values(exports).find(isProxied)
  }
  return false
}

function isProxied(o) {
  return o && !!o.__reactPatchProxy
}
