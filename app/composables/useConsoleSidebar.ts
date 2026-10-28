export function useConsoleSidebar() {
  const collapsed = useState('console-sidebar-collapsed', () => false)

  function toggle() {
    collapsed.value = !collapsed.value
  }

  return { collapsed, toggle }
}
