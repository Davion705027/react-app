import './App.css';
import React,{useState} from 'react';

const Other = (props)=>{
  console.log(111);
  return (
    <div>other</div>
  )
}
function App() {
  console.log('app run');
  const [num,setSum] = useState(0)
  return (
    <div className="App">
      <header className="App-header">
        { num }
      </header>
      <Other ></Other>
      <div onClick={()=>{setSum(num+1)}}>
        点击
      </div>
    </div>
  );
}
console.log(React.createElement(App));

export default App;
