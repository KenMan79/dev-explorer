import React, { useRef, useState, useEffect } from 'react'
import { useHistory, useLocation } from 'react-router-dom'

import { DataService } from './dataService'

type NetworkState = {
  connStatus: boolean,
  isIsolatedServer: boolean | null,
  dataService: DataService | null,
  nodeUrl: string,
  setNodeUrl: (nodeUrl: string) => void,
}

const useQuery = () => new URLSearchParams(useLocation().search)

export const defaultNetworks: { [key: string]: string } = (process.env['REACT_APP_DEPLOY_ENV'] === 'prd')
  ? {
    'https://api.zilliqa.com/': 'Mainnet',
    'https://dev-api.zilliqa.com/': 'Testnet',
    'https://zilliqa-isolated-server.zilliqa.com/': 'Isolated Server',
    'http://52.187.126.172:4201': 'Mainnet Staked Seed Node'
  }
  : {
    'https://api.zilliqa.com/': 'Mainnet',
    'https://dev-api.zilliqa.com/': 'Testnet',
    'https://zilliqa-isolated-server.zilliqa.com/': 'Isolated Server',
    'https://stg-zilliqa-isolated-server.zilliqa.com/': 'Staging Isolated Server',
    'http://52.187.126.172:4201': 'Mainnet Staked Seed Node'
  }

export const NetworkContext = React.createContext<NetworkState | null>(null)

export const NetworkProvider: React.FC = (props) => {

  const firstUpdate = useRef(true);
  const query = useQuery()
  const history = useHistory()

  const [state, setState] = useState<NetworkState>({
    connStatus: false,
    isIsolatedServer: false,
    dataService: null,
    nodeUrl: query.get('network') || 'https://api.zilliqa.com/',
    setNodeUrl: (newNodeUrl: string) => {
      setState({ ...state, nodeUrl: newNodeUrl })
    }
  })

  /* Redirect useEffect */
  useEffect(() => {
    if (firstUpdate.current) {
      firstUpdate.current = false
    } else {
      if (state.nodeUrl === 'https://api.zilliqa.com/')
        history.push('/')
      else
        history.push({
          pathname: '/',
          search: '?' + new URLSearchParams({ network: state.nodeUrl }).toString()
        })
    }
    // Effect is independent of history
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.nodeUrl])

  // If nodeurl changes, update dataservice
  useEffect(() => {
    setState((prevState: NetworkState) => (
      { ...prevState, dataService: new DataService(state.nodeUrl), isIsolatedServer: null }))
  }, [state.nodeUrl])

  // If dataservice changes, update isIsolatedServer
  useEffect(() => {
    let response: boolean
    const checkNetwork = async () => {
      try {
        if (!state.dataService) return
        response = await state.dataService.isIsolatedServer()
        setState((prevState: NetworkState) => ({ ...prevState, isIsolatedServer: response }))
      } catch (e) {
        console.log(e)
      }
    }

    checkNetwork()
  }, [state.dataService])

  return <NetworkContext.Provider value={state}>
    {props.children}
  </NetworkContext.Provider>
}
