import { useRoutes } from "react-router-dom";
import Home from '../pages/home'
const routes = [
    {
        path:'/',
        element: <Home/>
    },
]

export const RouterRender = () => {
    return useRoutes(routes)
}