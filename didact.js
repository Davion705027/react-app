function createElement(type, props, ...children) {
    return {
        type,
        props:
        {
            ...props, 
            children: children.map(child => typeof child === 'object' ? child : createTextElement(child))
        }
    }
}

function createTextElement(text) {
    return {
        type: 'TEXT_ELEMENT',
        props: {
            nodeValue: text,
            children: []
        }
    }
}


let nextUnitOfWork = null
let currentRoot = null
let wipRoot = null
let deletions = null

function workLoop(deadline){
    let shouldYield = false;
    while(nextUnitOfWork && !shouldYield){
        nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
        shouldYield = deadline.timeRemaining() < 1;
    }

    if(!nextUnitOfWork && wipRoot){
        commitRoot();
    }

    // requestIdleCallback 还给了我们一个截止时间参数。我们可以用它来检查我们有多少时间，直到浏览器需要再次控制
    requestIdleCallback(workLoop);
}
requestIdleCallback(workLoop);

const isEvent = key => key.startsWith("on")
const isProperty = key =>
  key !== "children" && !isEvent(key)
const isNew = (prev, next) => key =>
  prev[key] !== next[key]
const isGone = (prev, next) => key => !(key in next)
function updateDom(dom,prevProps,nextProps){
  // remove old or changed event listeners
  Object.keys(prevProps)
    .filter(isEvent)
    .filter(key => !(key in nextProps) || isNew(prevProps,nextProps)(key))
    .forEach(name=>{
        const eventType = name.toLowerCase().substring(2)
        dom.removeEventListener(eventType,prevProps[name])
    })

  // remove old properties
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps,nextProps))
    .forEach(name=>{
      dom[name] = ""
    })
  
  // set new or changed properties
  Object.keys(nextProps)
  .filter(isProperty)
  .filter(isNew(prevProps, nextProps))
  .forEach(name => {
    dom[name] = nextProps[name]
  })

  // add event listeners
  Object.keys(nextProps)
  .filter(isEvent)
  .filter(isNew(prevProps, nextProps))
  .forEach(name => {
    const eventType = name
      .toLowerCase()
      .substring(2)
    dom.addEventListener(
      eventType,
      nextProps[name]
    )
  })
}

// 将DOM变化应用到DOM 删除dom 修改属性
function commitRoot(){
    // 1. 删除旧的DOM节点
    deletions.forEach(commitWork);
    // 2. 添加新的DOM节点
    // 3. 更新DOM节点
    commitWork(wipRoot.child);
    currentRoot = wipRoot;
    wipRoot = null;
}
// dom操作
function commitWork(fiber){
    if(!fiber) return;

    let domParentFiber = fiber.parent
    // 向上查找直到找到DOM节点 兼容函数组件
    while (!domParentFiber.dom) {
      domParentFiber = domParentFiber.parent
    }
    const domParent = domParentFiber.dom;

    if(
      fiber.effectTag === 'PLACEMENT' &&
      fiber.dom != null
    ){
      domParent.appendChild(fiber.dom);
    }else if(
      fiber.effectTag === 'UPDATE' &&
      fiber.dom != null
    ){
      updateDom(fiber.dom,fiber.alternate.props,fiber.props)
    }else if(fiber.effectTag === 'DELETION'){
      // 删除节点
      commitDeletion(fiber,domParent);
    }
    commitWork(fiber.child);
    commitWork(fiber.sibling);
}

function commitDeletion(filber,domParent){
  if(fiber.dom){
    domParent.removeChild(fiber.dom);
  }else{
    commitDeletion(fiber.child,domParent);
  }
}

function updateHostComponent(fiber) {
  if (!fiber.dom) {
    fiber.dom = createDom(fiber)
  }
  reconcileChildren(fiber, fiber.props.children)
}

// 正在进行的fiber
let wipFiber = null
let hookIndex = null
// fiber.type是这个函数 执行来获取children
function updateFunctionComponent(fiber){
  wipFiber = fiber 
  hookIndex = 0
  wipFiber.hooks = [] // hooks数组 支持同一组件多次调用useState
  const children = [fiber.type(fiber.props)]
  reconcileChildren(fiber, children)
}

function useState(initial){
  const oldHook =
    wipFiber.alternate &&
    wipFiber.alternate.hooks &&
    wipFiber.alternate.hooks[hookIndex]
  const hook = {
    state: oldHook ? oldHook.state : initial,
    queue: [] // 存放setState的回调函数
  }

  const actions = oldHook ? oldHook.queue : []
  actions.forEach(action=>{
    hook.state = action(hook.state)
  })

  const setState = action =>{
    hook.queue.push(action)
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot
    }
    nextUnitOfWork = wipRoot
    deletions = []
  }

  wipFiber.hooks.push(hook)
  hookIndex++
  return [hook.state,setState]
}
/*
  深度遍历

  如果fiber
   - 有child child是下一个单元
   - 没有child,使用siblings作为下一个工作单元
   - 没有child和sibling 使用siblings的parent作为下一个工作单元
   - 
*/ 
// 执行工作 返回下一个工作单元
// 1. add the element to the DOM
// 2. create the fibers for the element"s children
// 3. select the next unit of work
function performUnitOfWork(fiber){
  const isFunctionComponent =
      fiber.type instanceof Function

  if (isFunctionComponent) {
    // 拿到函数组件fiber 调和子节点
    updateFunctionComponent(fiber)
  } else {
    // 初始化创建dom 调和子节点
    updateHostComponent(fiber)
  }

  // if(fiber.parent){
  //   fiber.parent.dom.appendChild(fiber.dom);
  // }

  // 2.create new fibers
  // const elements = fiber.props.children
  // reconcileChildren(fiber,elements)

   // 3.return next unit of worl
  if(fiber.child){
    return fiber.child;
  }
  let nextFiber = fiber;
  while(nextFiber){
    if(nextFiber.sibling){
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent;
  }
}

// 调和子节点
function reconcileChildren(fiber,elements){
  let index = 0;
  let oldFiber = fiber.alternate && fiber.alternate.child;
  let prevSibling = null;

  while(index < elements.length || oldFiber != null){
    const element = elements[index];
    let newFiber = null;
    const sameType = oldFiber && element && element.type == oldFiber.type;
    // 类型相同 更新
    if(sameType){
      newFiber = {
        type: element.type,
        props: element.props,
        parent: fiber,
        dom: oldFiber.dom,
        alternate: oldFiber,
        effectTag: 'UPDATE'
      }
    }

    // 类型不同 并且有新元素 创建新的fiber ｜ 初始化函数组件
    if(element && !sameType){
      newFiber = {
        type: element.type,
        props: element.props,
        parent: fiber,
        dom:null,
        alternate:null,
        effectTag: 'PLACEMENT',
      }
    }

    // 类型不同 并且有旧fiber 删除旧fiber
    if(oldFiber && !sameType){
      oldFiber.effectTag = 'DELETION'
      deletions.push(oldFiber)
    }

    if(oldFiber){
      oldFiber = oldFiber.sibling
    }

    if(index === 0){ // 拿到函数组件child
      fiber.child = newFiber; 
    }else{
      prevSibling.sibling = newFiber
    }
    prevSibling = newFiber
    index++
  }

 
}

// 创建DOM节点
function createDom(fibler){
  const dom = 
  fibler.type == 'TEXT_ELEMENT' ? document.createTextNode('') : document.createElement(fibler.type);
  const isProperty = key => key !== 'children';
  Object.keys(fibler.props || {})
  .filter(isProperty)
  .forEach(name=>{
    dom[name] = fibler.props[name]
  })
  return dom;
}




function render(element,container){
  debugger
  // todo set next unit of work
  wipRoot = {
    dom: container,
    props: {
      children: [element]
    },
    alternate:currentRoot,
    child: null,
    sibling: null,
    parent: null
  }
  deletions = []
  nextUnitOfWork = wipRoot
}


// 此递归调用存在问题 开始渲染就不会停止
// function render(element, container) {
//     const dom = element.type == 'TEXT_ELEMENT' ? document.createTextNode() : document.createElement(element.type)
//     const isProperty = key => key !== 'children'
//     Object.keys(element.props|| {})
//     .filter(isProperty)
//     .forEach(name => { dom[name] = element.props[name] })

//     element?.props?.children.forEach(child => { render(child, dom) })

//     container.appendChild(dom)
//   }

//   let element = {
//     type: 'div',
//     props: {
//       id: 'foo',
//       children: [
//         {
//           type: 'a',
//           props: {
//             href: 'google.com',
//             children: ['Google']
//           }
//         },
//         'Hello'
//       ]
//     }
//   }


/** @jsx createElement */
function Counter() {
  const [state, setState] = useState(1)
  return (
    <h1 onClick={() => setState(c => c + 1)}>
      Count: {state}
    </h1>
  )
}

const element = <Counter />
const container = document.querySelector('#root')
render(element, container)


/**
 * 
 * 
 * **/